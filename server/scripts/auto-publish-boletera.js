const pool = require('../db');

const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { normalizeBoleteraCandidate } = require('../utils/normalizeBoleteraCandidate');
const { buildBoleteraReviewAnalysis } = require('../utils/buildBoleteraReviewAnalysis');
const { assessBoleteraMusicCandidate } = require('../utils/assessBoleteraMusicCandidate');
const { extractBoleteraFlyer } = require('../utils/extractBoleteraFlyer');
const { buildSourceContentHash } = require('../utils/sourceContentHash');
const {
  assessMusicCatalogEligibility
} = require('../utils/assessMusicCatalogEligibility');

const args = process.argv.slice(2);
const publish = args.includes('--publish');
const simulate = args.includes('--simulate');
const all = args.includes('--all');

if (
  args.some(arg => !['--publish', '--simulate', '--all'].includes(arg)) ||
  (publish && simulate) ||
  ((publish || simulate) && !all)
) {
  throw new Error(
    'Uso: node scripts/auto-publish-boletera.js [--all --simulate | --all --publish]'
  );
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'boletos.boletera.net' &&
      /^\/e\/[^/]+$/.test(url.pathname.replace(/\/$/, '')) &&
      !url.username && !url.password &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
}

async function getLiveEvent(sourceUrl) {
  if (!validSource(sourceUrl)) {
    throw new Error('URL de Boletera no autorizada.');
  }

  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: { Accept: 'text/html' }
  });

  if (!response.ok || response.url !== sourceUrl) {
    throw new Error('La página original no pudo verificarse.');
  }

  const html = await response.text();

  if (html.length > 3000000) {
    throw new Error('Página demasiado grande.');
  }

  const events = extractEventJsonLd(html, sourceUrl);

  if (events.length !== 1) {
    throw new Error('Se esperaba exactamente un evento estructurado.');
  }

  return {
    raw: events[0],
    flyer: extractBoleteraFlyer(html)
  };
}

async function verifyImage(url) {
  if (!url) return false;

  const parsed = new URL(url);

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'res.cloudinary.com' ||
    !parsed.pathname.startsWith('/eventservice/image/upload/') ||
    !/\.(webp|png|jpg|jpeg)$/i.test(parsed.pathname)
  ) {
    return false;
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: {
      Accept: 'image/*',
      Range: 'bytes=0-0'
    }
  });

  const type = response.headers.get('content-type') || '';
  await response.body?.cancel();

  return response.ok && type.startsWith('image/');
}

async function evaluate(candidate) {
  const { raw, flyer } = await getLiveEvent(candidate.source_url);
  const live = normalizeBoleteraCandidate(raw);
  const currentAnalysis = buildBoleteraReviewAnalysis(raw);
  const { assessment, eligibleForReview } =
    assessBoleteraMusicCandidate(raw);

  const saved = candidate.analysis_result?.event || {};
  const liveEvent = currentAnalysis.event || {};
  const normalized = liveEvent.normalized || {};
  const problems = [];

  const liveHash = buildSourceContentHash({
    captionText: JSON.stringify(raw)
  });

  if (candidate.source_content_hash !== liveHash) {
    problems.push('La fuente cambió: requiere actualizar el candidato');
  }

  if (
    normalize(saved.title) !== normalize(live.title) ||
    normalize(saved.venue) !== normalize(live.venue) ||
    normalize(saved.municipality) !== normalize(live.municipality) ||
    saved.normalized?.start_at !== live.start_at
  ) {
    problems.push('Los datos actuales difieren del candidato');
  }

  if (
    !live.title ||
    !live.venue ||
    !live.municipality ||
    !live.eligible_for_feed ||
    currentAnalysis.validation?.basic_checks_passed !== true ||
    candidate.analysis_result?.validation?.basic_checks_passed !== true
  ) {
    problems.push('Validación estructural incompleta');
  }

  if (
    !eligibleForReview ||
    assessment.has_musical_program_evidence !== true ||
    ['evento_no_musical', 'evento_mixto_pendiente_de_verificar']
      .includes(assessment.classification)
  ) {
    problems.push('Actuación musical no corroborada');
  }

  const date = new Date(live.start_at || '');

  if (Number.isNaN(date.getTime()) || date <= new Date()) {
    problems.push('Fecha pasada o inválida');
  }

  const eventStatus = String(liveEvent.event_status || '')
    .split('/').pop().toLowerCase();

  if (!['scheduled', 'eventscheduled'].includes(eventStatus)) {
    problems.push('Estado del evento no confirmado');
  }

  const expectedTickets =
    candidate.source_url.replace(/\/$/, '') + '/tickets';

  if (
    !validSource(candidate.source_url) ||
    live.ticket_url !== expectedTickets ||
    liveEvent.ticket_url !== expectedTickets
  ) {
    problems.push('Enlace oficial de boletos inconsistente');
  }

  const priceType = normalized.price_type;
  const priceMin = normalized.price_min;
  const priceMax = normalized.price_max;

  if (
    !['free', 'paid', 'unknown'].includes(priceType) ||
    [priceMin, priceMax].some(value =>
      value != null &&
      (typeof value !== 'number' ||
       !Number.isFinite(value) ||
       value < 0)
    ) ||
    (priceMin != null && priceMax != null && priceMax < priceMin)
  ) {
    problems.push('Precio inválido o contradictorio');
  }

  if (!flyer || !(await verifyImage(flyer))) {
    problems.push('Flyer oficial no verificado');
  }

  const venues = await pool.query(`
    SELECT id, name, municipality
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      AND LOWER(TRIM(municipality)) = LOWER(TRIM($2))
      AND location_verification_status = 'verified'
  `, [live.venue || '', live.municipality || '']);

  if (venues.rows.length !== 1) {
    problems.push('Local no registrado o no verificado');
  }

  const sources = await pool.query(`
    SELECT id FROM public.sources WHERE name = 'Boletera'
  `);

  if (sources.rows.length !== 1) {
    problems.push('Boletera no registrada como fuente');
  }

  const duplicates = await pool.query(`
    SELECT id FROM public.events
    WHERE start_at = $1
      AND (
        venue_id = $2
        OR LOWER(TRIM(title)) = LOWER(TRIM($3))
      )
    LIMIT 1
  `, [
    Number.isNaN(date.getTime()) ? null : date.toISOString(),
    venues.rows[0]?.id || null,
    live.title || ''
  ]);

  if (duplicates.rows.length) {
    problems.push('Posible evento duplicado');
  }

  const linked = await pool.query(`
    SELECT event_id FROM public.event_sources
    WHERE source_url = $1 LIMIT 1
  `, [candidate.source_url]);

  if (linked.rows.length) {
    problems.push('Fuente ya vinculada a un evento');
  }

  // Apply the same publication policy used by the catalog.
  // Verification statuses are derived from live checks,
  // not copied from candidate claims.
  const musicConfirmed =
    eligibleForReview === true &&
    assessment.has_musical_program_evidence === true &&
    ![
      'evento_no_musical',
      'evento_mixto_pendiente_de_verificar'
    ].includes(assessment.classification);

  const sourceConfirmed =
    validSource(candidate.source_url) &&
    candidate.source_content_hash === liveHash &&
    live.ticket_url === expectedTickets &&
    liveEvent.ticket_url === expectedTickets;

  const policy = assessMusicCatalogEligibility({
    event: {
      ...liveEvent,
      source_url: candidate.source_url
    },
    verification: {
      source_status: sourceConfirmed
        ? 'verified' : 'needs_review',
      music_status: musicConfirmed
        ? 'verified_music' : 'needs_review',
      venue_status: venues.rows.length === 1
        ? 'verified' : 'needs_review',
      duplicate_status:
        duplicates.rows.length === 0 &&
        linked.rows.length === 0
          ? 'clear' : 'needs_review',
      conflict_status: problems.length === 0
        ? 'clear' : 'needs_review'
    }
  });

  if (!policy.eligible_for_auto_publication) {
    problems.push(
      'Reglas compartidas: ' + policy.blockers.join(', ')
    );
  }

  return {
    problems, live, raw, flyer, normalized, date,
    venue: venues.rows[0], source: sources.rows[0],
    assessment, liveHash
  };
}

async function writeEvent(candidate, result) {
  const db = await pool.connect();
  let started = false;

  try {
    await db.query('BEGIN');
    started = true;

    const locked = await db.query(`
      SELECT *
      FROM public.event_candidates
      WHERE id = $1
        AND source_name = 'Boletera'
        AND is_test = FALSE
      FOR UPDATE
    `, [candidate.id]);

    const current = locked.rows[0];

    if (
      !current ||
      current.review_status !== 'pending_review' ||
      current.approved_event_id ||
      current.source_url !== candidate.source_url ||
      current.source_content_hash !== result.liveHash ||
      current.source_content_hash !== buildSourceContentHash({
        captionText: current.caption_text
      })
    ) {
      throw new Error('El candidato cambió durante la verificación.');
    }

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [result.venue.id + '|' + result.date.toISOString()]
    );

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        'event-title:' + normalize(result.live.title) +
        '|' + result.date.toISOString()
      ]
    );

    const venue = await db.query(`
      SELECT id FROM public.venues
      WHERE id = $1
        AND LOWER(TRIM(name)) = LOWER(TRIM($2))
        AND LOWER(TRIM(municipality)) = LOWER(TRIM($3))
        AND location_verification_status = 'verified'
      FOR SHARE
    `, [
      result.venue.id,
      result.live.venue,
      result.live.municipality
    ]);

    const source = await db.query(`
      SELECT id FROM public.sources
      WHERE id = $1 AND name = 'Boletera'
      FOR SHARE
    `, [result.source.id]);

    if (
      venue.rowCount !== 1 ||
      source.rowCount !== 1 ||
      result.date <= new Date()
    ) {
      throw new Error('Fuente, local o fecha dejaron de ser válidos.');
    }

    const duplicate = await db.query(`
      SELECT id FROM public.events
      WHERE start_at = $1
        AND (
          venue_id = $2
          OR LOWER(TRIM(title)) = LOWER(TRIM($3))
        )
      LIMIT 1
    `, [
      result.date.toISOString(),
      result.venue.id,
      result.live.title
    ]);

    const linked = await db.query(`
      SELECT event_id FROM public.event_sources
      WHERE source_url = $1 LIMIT 1
    `, [candidate.source_url]);

    if (duplicate.rowCount || linked.rowCount) {
      throw new Error('Evento duplicado o fuente ya vinculada.');
    }

    const description = String(result.raw.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000) || null;

    const inserted = await db.query(`
      INSERT INTO public.events (
        title, description, venue_id, start_at,
        status, price_type, price_min, price_max,
        flyer_url, ticket_url, ticket_provider,
        is_published
      )
      VALUES (
        $1, $2, $3, $4,
        'scheduled', $5, $6, $7,
        $8, $9, 'Boletera', TRUE
      )
      RETURNING id
    `, [
      result.live.title,
      description,
      result.venue.id,
      result.date.toISOString(),
      result.normalized.price_type,
      result.normalized.price_min ?? null,
      result.normalized.price_max ?? null,
      result.flyer,
      result.live.ticket_url
    ]);

    const eventId = inserted.rows[0].id;

    await db.query(`
      INSERT INTO public.event_sources (
        event_id, source_id, source_url, last_checked_at
      )
      VALUES ($1, $2, $3, NOW())
    `, [
      eventId,
      result.source.id,
      candidate.source_url
    ]);

    const analysis = {
      ...(current.analysis_result || {}),
      validation: {
        ...(current.analysis_result?.validation || {}),
        basic_checks_passed: true,
        safe_to_publish: true,
        review_required: false
      },
      automatic_publication: {
        method: 'automated_source_verification',
        checked_at: new Date().toISOString(),
        source_url: candidate.source_url,
        source_content_hash: result.liveHash,
        venue_id: result.venue.id,
        music_classification: result.assessment.classification,
        musical_program_verified: true,
        flyer_url: result.flyer
      }
    };

    const updated = await db.query(`
      UPDATE public.event_candidates
      SET review_status = 'approved',
          approved_event_id = $1,
          reviewed_at = NOW(),
          flyer_url = $3,
          analysis_result = $4::jsonb
      WHERE id = $2
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
        AND is_test = FALSE
      RETURNING id
    `, [
      eventId,
      candidate.id,
      result.flyer,
      JSON.stringify(analysis)
    ]);

    if (updated.rowCount !== 1) {
      throw new Error('No se pudo vincular el candidato.');
    }

    if (simulate) {
      await db.query('ROLLBACK');
      started = false;
      return null;
    }

    await db.query('COMMIT');
    started = false;
    return eventId;

  } catch (error) {
    if (started) await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function main() {
  console.log('\n=== PUBLICADOR AUTOMÁTICO BOLETERA ===');
  console.log(
    'Modo:',
    publish ? 'PUBLICACIÓN REAL' :
    simulate ? 'SIMULACIÓN CON ROLLBACK' : 'SOLO LECTURA'
  );

  const { rows } = await pool.query(`
    SELECT *
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND is_test = FALSE
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
    ORDER BY source_url
    LIMIT 50
  `);

  let ready = 0;
  let blocked = 0;
  let errors = 0;
  let published = 0;
  let simulated = 0;

  for (const candidate of rows) {
    console.log('\nFuente:', candidate.source_url);

    try {
      // Do not fetch expired candidates during publication.
      // A rescheduled event must first refresh its stored evidence.
      const savedStart =
        candidate.analysis_result?.event?.normalized?.start_at;

      const savedDate = new Date(savedStart || '');

      if (
        !savedStart ||
        Number.isNaN(savedDate.getTime()) ||
        savedDate <= new Date()
      ) {
        blocked++;
        console.log(
          'BLOQUEADO: Fecha almacenada vencida o inválida.'
        );
        continue;
      }

      const result = await evaluate(candidate);

      if (result.problems.length) {
        blocked++;
        console.log('BLOQUEADO:', result.problems.join('; '));
        continue;
      }

      ready++;
      console.log('PASÓ PREVALIDACIÓN:', result.live.title);

      if (publish || simulate) {
        const eventId = await writeEvent(candidate, result);

        if (simulate) {
          simulated++;
          console.log('TRANSACCIÓN PROBADA Y REVERTIDA');
        } else {
          published++;
          console.log('PUBLICADO:', eventId);
        }
      }
    } catch (error) {
      errors++;
      console.error('ERROR:', error.message);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Candidatos:', rows.length);
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
