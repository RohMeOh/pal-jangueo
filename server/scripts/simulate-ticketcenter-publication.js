const pool = require('../db');
const { buildSourceContentHash } = require('../utils/sourceContentHash');

const reviewedIds = new Set([
  '56820e93-a1ff-4dc5-83d4-3999dd5f631c',
  '3efaddea-9684-4639-8a87-5b6635110f27',
  '4a1bcc8b-f5a8-4868-a3bb-d6d75b73efb3',
  'a9eb0e2e-358e-417a-8b4b-95282fe56a32',
  'ddd02cf2-26b5-42ef-ae17-d218f80661c0',
  '955dd326-daa1-4c30-950d-75a3b632eca1',
  'd6a64a1e-d1cd-47a6-84aa-b98d95835cea',
  '022ab846-d493-4015-98cb-6dadb00f6fd5',
  '111d03c4-a8f4-417c-aa22-1d57d6113960',
  '6eb0d241-40cd-4241-bfff-8cf692b65e32',
  '8dae51dc-1d79-4284-a3c1-d1fdc52a0839',
  'ba3c84b5-ffb0-4571-a6a6-0911efe23c61',
  'fe1c0ed8-f178-45cf-90c3-b8128f09c6f2',
  '6ed7ed80-40ad-4eb8-8632-83e9b33751c7',
  'b94145fa-c163-45f0-b0fb-e53931e23f16',
  '28f29292-62fe-4878-afbf-3c401eab3a2e',
  'ad950199-1d8c-46f0-a55d-255d31ed0043',
  '9968dbdd-962d-4d36-8580-1ba735e6ccc2',
  '9515a6ee-af2e-4dcb-bf94-b1c43c92bbd6'
]);

async function main() {
  const db = await pool.connect();

  try {
    await db.query('BEGIN');
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['ticketcenter-publication']
    );

    const { rows } = await db.query(`
      SELECT id, source_url, caption_text,
             source_content_hash, analysis_result
      FROM public.event_candidates
      WHERE source_name = 'Ticket Center PR'
        AND is_test = FALSE
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
      FOR UPDATE
    `);

    const selected = rows.filter(row => {
      const research = row.analysis_result.editorial_research;
      if (research?.classification === 'non_music') return false;
      return reviewedIds.has(row.id) ||
        research?.classification === 'music';
    });

    if (selected.length !== 30) {
      throw new Error(
        `Se esperaban 30 funciones; encontradas: ${selected.length}.`
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
          NULL, $5, 'Ticket Center PR', TRUE
        )
        RETURNING id
      `, [
        e.title, e.description || null, e.venue_id,
        start.toISOString(), candidate.source_url
      ]);

      await db.query(`
        INSERT INTO public.event_sources (
          event_id, source_id, source_url, last_checked_at
        )
        VALUES ($1, $2, $3, NOW())
      `, [inserted[0].id, sources[0].id, candidate.source_url]);

      const updated = await db.query(`
        UPDATE public.event_candidates
        SET approved_event_id = $2
        WHERE id = $1
          AND review_status = 'pending_review'
          AND approved_event_id IS NULL
        RETURNING id
      `, [candidate.id, inserted[0].id]);

      if (updated.rowCount !== 1) {
        throw new Error(`No se pudo probar el vínculo: ${e.title}`);
      }

      results.push({ evento: e.title, fecha: start.toISOString() });
    }

    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('ROLLBACK');

    console.table(results);
    console.log('Inserciones y vínculos probados:', results.length);
    console.log('Transacción revertida: SÍ');
    console.log('Cambios persistentes: 0');
    console.log('Eventos publicados: 0');
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
