const pool = require('../db');
const {
  planTicketVenue,
  ensureTicketVenue
} = require('../utils/ticketVenueRegistry');

const {
  LIST_URL, fetchHtml, extractCards, extractDetail
} = require('./discover-prticket');

const {
  normalizePrticketEvent
} = require('../utils/normalizePrticketEvent');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

const args = process.argv.slice(2);

const publish = args.includes('--publish');
const simulate = args.includes('--simulate');
const all = args.includes('--all');
const slugArgs = args.filter(arg => arg.startsWith('--slug='));
const slug = slugArgs[0]?.slice(7) || null;

if (
  (publish && simulate) ||
  (all && slug) ||
  slugArgs.length > 1 ||
  args.some(arg =>
    !['--publish', '--simulate', '--all'].includes(arg) &&
    !/^--slug=[a-z0-9_-]+$/.test(arg)
  ) ||
  ((publish || simulate) && !slug && !all) ||
  (all && !publish && !simulate)
) {
  throw new Error(
    'Uso: [--slug=nombre | --all] [--simulate | --publish]'
  );
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function trustedFlyer(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'dgxrvn37x26wa.cloudfront.net' &&
      !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

async function publishCandidate(candidate, live, venuePlan, flyer, description, simulate) {
  const db = await pool.connect();

  try {
    await db.query('BEGIN');

    const sourceAddress = new URL(candidate.source_url);
    const music = assessMusicEvidence(description);

    if (
      sourceAddress.protocol !== 'https:' ||
      sourceAddress.hostname !== 'boletos.prticket.com' ||
      !/^\/events\/es\/[a-z0-9_-]+\/?$/i.test(sourceAddress.pathname) ||
      live.status !== 'structured_data_ready' ||
      description.trim().length < 40 ||
      !music.has_musical_program_evidence ||
      music.non_music_event_detected ||
      music.mixed_event_detected
    ) {
      throw new Error('Verificación musical o de fuente fallida.');
    }

    const locked = await db.query(`
      SELECT *
      FROM public.event_candidates
      WHERE id = $1
        AND source_name = 'PRticket'
        AND is_test = FALSE
      FOR UPDATE
    `, [candidate.id]);

    const current = locked.rows[0];
    const saved = current?.analysis_result?.event || {};

    if (
      !current ||
      current.review_status !== 'pending_review' ||
      current.approved_event_id ||
      current.source_url !== candidate.source_url ||
      current.source_content_hash !== candidate.source_content_hash ||
      current.source_content_hash !== buildSourceContentHash({
        captionText: current.caption_text
      }) ||
      normalize(saved.title) !== normalize(live.title) ||
      normalize(saved.venue) !== normalize(live.venue) ||
      saved.normalized?.start_at !== live.start_at
    ) {
      throw new Error('El candidato cambió o su evidencia no coincide.');
    }

    const venueRecord = await ensureTicketVenue(
      db, venuePlan
    );

    await db.query(`
      SELECT pg_advisory_xact_lock(hashtext($1))
    `, [
      venueRecord.id + '|' + new Date(live.start_at).toISOString()
    ]);

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['event-title:' + normalize(live.title) + '|' + live.start_at]
    );

    if (new Date(live.start_at) <= new Date()) {
      throw new Error('Fecha vencida.');
    }

    const source = await db.query(`
      SELECT id FROM public.sources
      WHERE name = 'PRticket'
    `);

    if (source.rowCount !== 1) {
      throw new Error('Fuente PRticket no registrada.');
    }

    const duplicate = await db.query(`
      SELECT id FROM public.events
      WHERE start_at = $1
        AND (
          venue_id = $2
          OR LOWER(TRIM(title)) = LOWER(TRIM($3))
        )
      LIMIT 1
    `, [live.start_at, venueRecord.id, live.title]);

    const linked = await db.query(`
      SELECT event_id FROM public.event_sources
      WHERE source_url = $1
      LIMIT 1
    `, [candidate.source_url]);

    if (duplicate.rowCount || linked.rowCount) {
      throw new Error('Evento duplicado o fuente ya vinculada.');
    }

    const inserted = await db.query(`
      INSERT INTO public.events (
        title, description, venue_id, start_at, status,
        price_type, price_min, price_max,
        flyer_url, ticket_url, ticket_provider, is_published
      )
      VALUES (
        $1, $2, $3, $4, 'scheduled',
        'unknown', NULL, NULL,
        $5, $6, 'PRticket', TRUE
      )
      RETURNING id
    `, [
      live.title, description, venueRecord.id, live.start_at,
      flyer, candidate.source_url
    ]);

    const eventId = inserted.rows[0].id;

    await db.query(`
      INSERT INTO public.event_sources (
        event_id, source_id, source_url, last_checked_at
      )
      VALUES ($1, $2, $3, NOW())
    `, [
      eventId, source.rows[0].id, candidate.source_url
    ]);

    const evidence = {
      method: 'automated_source_verification',
      checked_at: new Date().toISOString(),
      source_url: candidate.source_url,
      source_content_hash: current.source_content_hash,
      music_classification: music.classification,
      musical_performance_detected: true,
      venue_id: venueRecord.id,
      start_at: live.start_at,
      music_evidence: description.slice(0, 800),
      safe_to_publish: true
    };

    const originalAnalysis = current.analysis_result || {};

    const approvedAnalysis = {
      ...originalAnalysis,
      status: 'approved',
      review_required: false,
      event: {
        ...originalAnalysis.event,
        is_music_event: true,
        event_status: 'EventScheduled'
      },
      verification: {
        ...originalAnalysis.verification,
        source_page_extracted: true,
        musical_program_verified: true,
        venue_verified: venueRecord.verified,
        venue_source_confirmed: true
      },
      validation: {
        ...originalAnalysis.validation,
        basic_checks_passed: true,
        safe_to_publish: true,
        review_required: false
      },
      automatic_publication: evidence
    };

    const updated = await db.query(`
      UPDATE public.event_candidates
      SET
        review_status = 'approved',
        approved_event_id = $1,
        reviewed_at = NOW(),
        analysis_result = $3::jsonb
      WHERE id = $2
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
        AND is_test = FALSE
      RETURNING id
    `, [
      eventId, candidate.id, JSON.stringify(approvedAnalysis)
    ]);

    if (updated.rowCount !== 1) {
      throw new Error('No se pudo vincular el candidato.');
    }

    if (simulate) {
      await db.query('ROLLBACK');
      return null;
    }

    await db.query('COMMIT');
    return eventId;

  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function main() {
  console.log('\n=== PUBLICACIÓN AUTOMÁTICA PRTICKET ===');
  console.log('Modo:', simulate ? 'SIMULACIÓN CON ROLLBACK' : publish ? 'PUBLICAR' : 'VISTA PREVIA');

  const { rows } = await pool.query(`
    SELECT
      id, source_url, source_content_hash,
      analysis_result, review_status, approved_event_id
    FROM public.event_candidates
    WHERE source_name = 'PRticket'
      AND is_test = FALSE
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
    ORDER BY source_url
    LIMIT 40
  `);

  const cards = extractCards(await fetchHtml(LIST_URL));

  let ready = 0;
  let blocked = 0;
  let published = 0;
  let simulated = 0;
  let errors = 0;

  const selected = slug
    ? rows.filter(candidate =>
        new URL(candidate.source_url).pathname.split('/').pop() === slug
      )
    : rows;

  if (slug && selected.length !== 1) {
    throw new Error('Debe existir exactamente un candidato con ese slug.');
  }

  for (const candidate of selected) {
    try {
      const problems = [];
      const card = cards.find(
        item => item.source_url === candidate.source_url
      );

      if (!card) {
        blocked++;
        console.log('\nBLOQUEADO:', candidate.source_url);
        console.log('No aparece en el listado actual.');
        continue;
      }

      const url = new URL(candidate.source_url);

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'boletos.prticket.com'
      ) {
        problems.push('Fuente no autorizada');
      }

      const detail = extractDetail(
        await fetchHtml(card.source_url)
      );

      const live = normalizePrticketEvent(card, detail);
      const stored = candidate.analysis_result?.event || {};

      if (live.status !== 'structured_data_ready') {
        problems.push('Información incompleta');
      }

      if (
        normalize(live.title) !== normalize(stored.title) ||
        normalize(live.venue) !== normalize(stored.venue) ||
        live.start_at !== stored.normalized?.start_at
      ) {
        problems.push('Datos diferentes del candidato');
      }

      const description = detail.description_evidence || '';
      const music = assessMusicEvidence(description);

      if (
        description.length < 40 ||
        !music.has_musical_program_evidence ||
        music.non_music_event_detected ||
        music.mixed_event_detected
      ) {
        problems.push('Actuación musical no verificada');
      }

      let venuePlan = null;

      try {
        venuePlan = planTicketVenue({
          sourceName: 'PRticket',
          sourceUrl: candidate.source_url,
          venueName: live.venue
        });
      } catch (error) {
        problems.push('Venue inválido: ' + error.message);
      }

      const duplicates = await pool.query(`
        SELECT e.id
        FROM public.events e
        WHERE e.start_at = $1
          AND (
            LOWER(TRIM(e.title)) = LOWER(TRIM($2))
            OR e.venue_id IN (
              SELECT v.id
              FROM public.venues v
              WHERE LOWER(TRIM(v.name)) = LOWER(TRIM($3))
            )
          )
        LIMIT 1
      `, [
        live.start_at,
        live.title,
        live.venue
      ]);

      const linked = await pool.query(`
        SELECT event_id FROM public.event_sources
        WHERE source_url = $1
        LIMIT 1
      `, [candidate.source_url]);

      if (linked.rowCount) {
        problems.push('Fuente ya vinculada');
      }

      console.log('\nEvento:', live.title);

      if (problems.length) {
        blocked++;
        console.log('BLOQUEADO:', problems.join('; '));
        continue;
      }

      ready++;
      console.log('PASÓ PREVALIDACIÓN');

      if (publish || simulate) {
        const flyer = trustedFlyer(
          detail.poster_url || live.poster_url
        );

        const id = await publishCandidate(
          candidate, live, venuePlan, flyer, description, simulate
        );

        if (simulate) {
          simulated++;
          console.log('TRANSACCIÓN PROBADA Y REVERTIDA');
        } else {
          published++;
          console.log('PUBLICADO:', id);
        }
      }
    } catch (error) {
      errors++;
      console.error(
        'ERROR:', candidate.source_url, error.message
      );
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Candidatos:', selected.length);
  console.log('Aptos:', ready);
  console.log('Bloqueados:', blocked);
  console.log('Errores:', errors);
  console.log('Simulaciones revertidas:', simulated);
  console.log('Publicados:', published);

  if (errors) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
