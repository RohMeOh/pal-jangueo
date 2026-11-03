const pool = require('../db');
const { safeUrl } = require('./discover-ticketcenter');
const { buildSourceContentHash } = require('../utils/sourceContentHash');


const fs = require('node:fs');
const args = process.argv.slice(2);

if (args.length !== 1 || !['--simulate', '--publish'].includes(args[0])) {
  throw new Error('Uso: --simulate o --publish');
}

const publish = args[0] === '--publish';
const audit = JSON.parse(
  fs.readFileSync('/tmp/ticketcenter-publication-audit.json', 'utf8')
);
const age = Date.now() - Date.parse(audit.checked_at);

if (
  !audit.passed ||
  !Number.isFinite(age) || age < 0 || age > 3600000 ||
  !Array.isArray(audit.candidates) || audit.candidates.length === 0 ||
  audit.candidates.some(c => c.resultado !== 'COINCIDE')
) {
  throw new Error('Auditoría incompleta o vencida; máximo una hora.');
}

const audited = new Map(audit.candidates.map(c => [c.id, c.hash]));
if (audited.size !== audit.candidates.length) throw new Error('Lista auditada duplicada.');


async function main() {
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
      audited.get(row.id) !== row.source_content_hash ||
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
          method: 'user_approved_reviewed_batch',
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
