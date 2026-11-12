const { reportTicketPublication } = require('../utils/reportTicketPublication');
const pool = require('../db');
const { safeUrl } = require('./discover-ticketcenter');
const { buildSourceContentHash } = require('../utils/sourceContentHash');
const {
  ticketcenterCandidateSnapshot
} = require('../utils/ticketcenterCandidateSnapshot');


const fs = require('node:fs');
const { assessTicketPublication } = require('../utils/assessTicketPublication');

const args = process.argv.slice(2);
if (args.length !== 1 || !['--simulate', '--publish'].includes(args[0])) {
  throw new Error('Uso: --simulate o --publish');
}
const publish = args[0] === '--publish';

function normalize(value) {
  return String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const aliases = {
  'musas eventos cba santurce': '1a354618-a703-4479-a8f5-accf8191468c',
  'sala sinfonica pablo casals': '905c581a-a4dd-4d83-aae4-bea12c5a5b16',
  'sala de teatro rene marques santurce': '0b0396d9-27b0-406a-a041-11cf0f506021',
  'sala de festivales antonio paoli santurce': '75b6985f-998a-4504-b980-648d62fa56e2',
  'sala experimental carlos marichal': '8307ceab-6c07-4380-8cd7-6e261e804549',
  'fundacion nacional para la cultura': '3306e371-568e-4297-9b70-cfb74ebf4562',
  'conservatorio de musica de pr': '657fe424-10a7-4cde-82f3-acfff47a88bb',
  'hollywood cafe ponce': 'cbde1ca9-ef85-439f-89c4-94dd504f97b7',
  'monero cafe teatro y bar': '15dcd01e-8606-47d4-a46a-d2322a7f5b95'
};

async function buildAutomaticAudit() {
  const path = '/tmp/ticketcenter-details.json';
  const age = Date.now() - fs.statSync(path).mtimeMs;
  const catalog = JSON.parse(fs.readFileSync(path, 'utf8'));

  if (
    age < 0 || age > 900000 ||
    catalog.source !== 'Ticket Center PR' ||
    catalog.details_complete !== true ||
    catalog.detail_errors?.length ||
    !Array.isArray(catalog.events) ||
    !catalog.events.length
  ) {
    throw new Error('Se requiere un catálogo completo de los últimos 15 minutos.');
  }

  const { rows } = await pool.query(`
    SELECT id, source_url, flyer_url, caption_text, source_content_hash, analysis_result
    FROM public.event_candidates
    WHERE source_name = 'Ticket Center PR'
      AND is_test = FALSE
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
  `);

  const { rows: venues } = await pool.query(`
    SELECT id, name, location_verification_status
    FROM public.venues
  `);
  const venueMap = new Map(venues.map(v => [v.id, v]));
  const candidates = [];

  for (const row of rows) {
    const a = row.analysis_result;
    const e = a?.event;
    const problems = [];
    const matches = [];

    for (const show of catalog.events) {
      for (const performance of show.performances || []) {
        if (performance.ticket_url === row.source_url) {
          matches.push({ show, performance });
        }
      }
    }

    if (!e || matches.length !== 1) {
      console.log('PENDIENTE:', row.source_url, 'Función ausente o ambigua');
      continue;
    }

    const { show, performance } = matches[0];
    const parsed = require('./discover-ticketcenter').performance(row.source_url);
    const venue = venueMap.get(e.venue_id);
    const title = normalize(show.title);

    if (
      safeUrl(row.source_url) !== row.source_url ||
      !/^\/es-PR\/events\//i.test(new URL(row.source_url).pathname) ||
      !parsed ||
      parsed.start_at !== performance.start_at ||
      performance.start_at !== e.normalized?.start_at
    ) problems.push('Fuente o fecha diferente');

    if (
      show.detail_checked !== true ||
      show.source_conflict ||
      title.startsWith('alma de tango')
    ) problems.push('Ficha pendiente o conflicto que requiere revisión');

    if (
      normalize(show.title) !== normalize(e.title) ||
      (show.description || '') !== (e.description || '') ||
      show.source_url !== a.extracted_evidence?.show_url ||
      row.source_content_hash !==
        buildSourceContentHash({ captionText: row.caption_text })
    ) problems.push('Evidencia diferente del candidato');

    if (
      /\bcascanueces\b|\bmaestra vida\b|\bles miserables\b|\bspelling bee\b/.test(title) ||
      ['toc toc', 'la fiesta del divorcio', 'los gomes vs los latorre',
       'beauty at the beach'].includes(title)
    ) problems.push('Fuera del alcance musical');

    const venueVerified = Boolean(
      venue &&
      venue.location_verification_status === 'verified' &&
      aliases[normalize(performance.venue_name)] === venue.id &&
      normalize(e.venue) === normalize(venue.name)
    );

    const duplicate = await pool.query(`
      SELECT id FROM public.events
      WHERE start_at = $1
        AND (
          venue_id = $2
          OR LOWER(TRIM(title)) = LOWER(TRIM($3))
        )
      LIMIT 1
    `, [performance.start_at, e.venue_id, show.title]);

    const linked = await pool.query(`
      SELECT event_id FROM public.event_sources
      WHERE source_url = $1 LIMIT 1
    `, [row.source_url]);

    const { policy } = assessTicketPublication({
      event: {
        title: show.title,
        venue: venue?.name || '',
        source_url: row.source_url,
        event_status: 'EventScheduled',
        normalized: {
          start_at: performance.start_at,
          price_type: 'unknown',
          price_min: null,
          price_max: null
        }
      },
      description: show.description || '',
      verification: {
        source_status: problems.length ? 'needs_review' : 'verified',
        venue_status: venueVerified ? 'verified' : 'needs_review',
        duplicate_status: duplicate.rowCount || linked.rowCount
          ? 'needs_review' : 'clear',
        conflict_status: problems.length ? 'needs_review' : 'clear'
      }
    });

    if (!policy.eligible_for_auto_publication) {
      problems.push(...policy.blockers);
    }

    if (problems.length) {
      console.log('PENDIENTE:', show.title, [...new Set(problems)].join('; '));
      continue;
    }

    candidates.push({
      id: row.id,
      snapshot: ticketcenterCandidateSnapshot(row),
      resultado: 'COINCIDE'
    });
  }

  console.log('Candidatos pendientes evaluados:', rows.length);
  console.log('Aptos para publicación automática:', candidates.length);
  return {
    checked_at: new Date().toISOString(),
    passed: true,
    evaluated: rows.length,
    candidates
  };
}

async function main() {
  const audit = await buildAutomaticAudit();
  const audited = new Map(audit.candidates.map(c => [c.id, c.snapshot]));
  if (audited.size !== audit.candidates.length) {
    throw new Error('Lista automática duplicada.');
  }
  if (!audited.size) {
    console.log('Eventos publicados: 0');
    reportTicketPublication({
      provider: 'Ticket Center PR',
      mode: publish ? 'Publicación' : 'Simulación',
      evaluated: audit.evaluated,
      ready: 0,
      blocked: audit.evaluated,
      errors: 0, simulated: 0, published: 0
    });
    return;
  }
  const db = await pool.connect();

  try {
    await db.query('BEGIN');
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['ticketcenter-publication']
    );

    const { rows } = await db.query(`
      SELECT id, source_url, flyer_url, caption_text,
             source_content_hash, analysis_result
      FROM public.event_candidates
      WHERE source_name = 'Ticket Center PR'
        AND is_test = FALSE
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
      FOR UPDATE
    `);


    const selected = rows.filter(row => audited.has(row.id));

    if (selected.some(row =>
      audited.get(row.id) !== ticketcenterCandidateSnapshot(row) ||
      row.analysis_result.editorial_research?.classification === 'non_music'
    )) {
      throw new Error('La evidencia cambió desde la auditoría.');
    }


    if (selected.length !== audited.size) {
      throw new Error(
        `Se esperaban ${audited.size} funciones; encontradas: ${selected.length}.`
      );
    }

    await db.query(`
      INSERT INTO public.sources (name, website_url)
      VALUES ('Ticket Center PR', 'https://tcpr.com/')
      ON CONFLICT (name) DO NOTHING
    `);

    const { rows: sources } = await db.query(`
      SELECT id FROM public.sources
      WHERE name = 'Ticket Center PR'
    `);
    if (sources.length !== 1) throw new Error('Fuente ambigua.');

    const results = [];

    for (const candidate of selected) {
      const flyerUrl = candidate.flyer_url || null;

      if (
        flyerUrl &&
        (
          safeUrl(flyerUrl) !== flyerUrl ||
          !/^\/weblink\/\d+\/get\.resource\/images\//.test(
            new URL(flyerUrl).pathname
          )
        )
      ) {
        throw new Error('URL del flyer inválida');
      }

      const a = candidate.analysis_result;
      const e = a.event;
      const start = new Date(e.normalized.start_at);
      const url = new URL(candidate.source_url);

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'tcpr.com' ||
        url.username || url.password || url.port ||
        !/^\/es-PR\/events\//i.test(url.pathname) ||
        !Number.isFinite(+start) || +start <= Date.now()
      ) {
        throw new Error(`Fuente o fecha inválida: ${e.title}`);
      }

      if (
        candidate.source_content_hash !==
        buildSourceContentHash({ captionText: candidate.caption_text })
      ) {
        throw new Error(`Contenido alterado: ${e.title}`);
      }

      const { rows: venues } = await db.query(`
        SELECT id FROM public.venues
        WHERE id = $1
          AND location_verification_status = 'verified'
        FOR SHARE
      `, [e.venue_id]);

      if (venues.length !== 1) {
        throw new Error(`Venue no verificado: ${e.title}`);
      }

      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [e.venue_id + '|' + start.toISOString()]
      );

      const duplicate = await db.query(`
        SELECT id FROM public.events
        WHERE start_at = $1
          AND (
            venue_id = $2
            OR LOWER(TRIM(title)) = LOWER(TRIM($3))
          )
      `, [start.toISOString(), e.venue_id, e.title]);

      const linked = await db.query(`
        SELECT event_id FROM public.event_sources
        WHERE source_url = $1
      `, [candidate.source_url]);

      if (duplicate.rowCount || linked.rowCount) {
        throw new Error(`Posible duplicado: ${e.title}`);
      }

      const { rows: inserted } = await db.query(`
        INSERT INTO public.events (
          title, description, venue_id, start_at, status,
          price_type, price_min, price_max,
          flyer_url, ticket_url, ticket_provider, is_published
        )
        VALUES (
          $1, $2, $3, $4, 'scheduled',
          'unknown', NULL, NULL,
          $6, $5, 'Ticket Center PR', TRUE
        )
        RETURNING id
      `, [
        e.title, e.description || null, e.venue_id,
        start.toISOString(), candidate.source_url, flyerUrl
      ]);

      await db.query(`
        INSERT INTO public.event_sources (
          event_id, source_id, source_url, last_checked_at
        )
        VALUES ($1, $2, $3, NOW())
      `, [inserted[0].id, sources[0].id, candidate.source_url]);

      const approved = {
        ...a,
        status: 'approved',
        review_required: false,
        event: {
          ...e,
          flyer_url: flyerUrl,
          is_music_event: true,
          event_status: 'EventScheduled'
        },
        verification: {
          ...a.verification,
          musical_program_verified: true,
          duplicate_status: 'clear',
          conflict_status: 'clear'
        },
        validation: {
          ...a.validation,
          basic_checks_passed: true,
          safe_to_publish: true,
          review_required: false
        },
        publication_review: {
          method: 'automated_ticketcenter_source_verification',
          candidate_hash: candidate.source_content_hash,
          audit_checked_at: audit.checked_at,
          reviewed_at: new Date().toISOString()
        }
      };

      const updated = await db.query(`
        UPDATE public.event_candidates
        SET approved_event_id = $2,
            review_status = 'approved',
            reviewed_at = NOW(),
            analysis_result = $3::jsonb
        WHERE id = $1
          AND review_status = 'pending_review'
          AND approved_event_id IS NULL
        RETURNING id
      `, [candidate.id, inserted[0].id, JSON.stringify(approved)]);

      if (updated.rowCount !== 1) {
        throw new Error(`No se pudo probar el vínculo: ${e.title}`);
      }

      results.push({ evento: e.title, fecha: start.toISOString() });
    }

    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query(publish ? 'COMMIT' : 'ROLLBACK');

    console.table(results);
    console.log('Inserciones y vínculos probados:', results.length);
    console.log('Modo:', publish ? 'PUBLICAR' : 'SIMULACIÓN REVERTIDA');
    console.log('Eventos publicados:', publish ? results.length : 0);
    reportTicketPublication({
      provider: 'Ticket Center PR',
      mode: publish ? 'Publicación' : 'Simulación',
      evaluated: audit.evaluated,
      ready: audit.candidates.length,
      blocked: audit.evaluated - audit.candidates.length,
      errors: 0,
      simulated: publish ? 0 : results.length,
      published: publish ? results.length : 0
    });
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
