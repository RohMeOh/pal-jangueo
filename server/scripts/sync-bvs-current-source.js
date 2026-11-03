const pool = require('../db');
const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { buildSourceContentHash } = require('../utils/sourceContentHash');
const {
  planTicketVenue, ensureTicketVenue
} = require('../utils/ticketVenueRegistry');

const args = process.argv.slice(2);
if (args.length !== 1 || !['--simulate', '--apply'].includes(args[0])) {
  throw new Error('Uso: --simulate o --apply');
}
const apply = args[0] === '--apply';
const source = 'https://boletos.boletera.net/e/bvsfreestyle';
const eventId = 'ae2eacb8-27c5-490b-8dad-e133d63856f1';
const candidateId = '2938e9a4-7a12-450a-a770-6a79f4a7fb9a';

async function read(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const events = extractEventJsonLd(html, source);
  if (events.length !== 1) throw new Error('Ficha estructurada ambigua.');
  return events[0];
}

async function main() {
  const raw = await read(source);
  const tickets = await read(source + '/tickets');

  if (JSON.stringify(raw) !== JSON.stringify(tickets)) {
    throw new Error('La ficha y la compra no coinciden.');
  }

  if (
    raw.name !== 'BVS Freestyle: Del Tótem al PH: Penthouse Edition' ||
    raw.event_type !== 'MusicEvent' ||
    raw.event_status !== 'https://schema.org/EventScheduled' ||
    new Date(raw.start_date).toISOString() !== '2026-11-08T00:00:00.000Z' ||
    raw.venue.name !== 'Condado Palm Inn - Salon Vistamar' ||
    raw.venue.municipality !== 'San Juan' ||
    raw.ticket_url !== source + '/tickets' ||
    !/Inicio del espect(?:á|&aacute;)culo:\s*9:30\s*p\.\s*m\./i.test(
      raw.description_raw || ''
    ) ||
    !/Apertura de puertas:\s*8:00\s*p\.\s*m\./i.test(
      raw.description_raw || ''
    )
  ) {
    throw new Error('La fuente cambió respecto a los datos verificados.');
  }

  const startAt = '2026-11-08T01:30:00.000Z';
  const doorsAt = '2026-11-08T00:00:00.000Z';
  const description =
    'Puertas: 8:00 PM. Inicio del espectáculo: 9:30 PM.\n\n' +
    'BVS Freestyle presenta Del Tótem al PH — Penthouse Edition. ' +
    'Batallas de rap improvisado y presentaciones de Xanderlind, ' +
    'Irania PR, Loupz y Practiko. Salón Vistamar, Condado Palm Inn, ' +
    'San Juan. Evento para todas las edades.';

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))', [source]
    );

    const { rows: candidates } = await db.query(`
      SELECT * FROM public.event_candidates
      WHERE id = $1 AND source_name = 'Boletera'
        AND source_url = $2 AND is_test = FALSE
      FOR UPDATE
    `, [candidateId, source]);

    const { rows: events } = await db.query(`
      SELECT * FROM public.events WHERE id = $1 FOR UPDATE
    `, [eventId]);

    const current = candidates[0];
    const previous = events[0];

    if (
      candidates.length !== 1 || events.length !== 1 ||
      current.review_status !== 'approved' ||
      current.approved_event_id !== eventId ||
      previous.ticket_provider !== 'Boletera' ||
      previous.ticket_url !== raw.ticket_url
    ) throw new Error('Registro aprobado o vínculo inesperado.');

    const previousAnalysis = current.analysis_result || {};
    if (previousAnalysis.source_sync?.source_hash ===
        buildSourceContentHash({ captionText: JSON.stringify(raw) }) &&
        previous.title === raw.name &&
        new Date(previous.start_at).toISOString() === startAt) {
      await db.query('ROLLBACK');
      console.log('La corrección ya está aplicada.');
      return;
    }

    const plan = planTicketVenue({
      sourceName: 'Boletera',
      sourceUrl: source,
      venueName: raw.venue.name,
      municipality: raw.venue.municipality
    });
    const venue = await ensureTicketVenue(db, plan);

    // Location corroborated by the official event and checkout pages.
    const verified = await db.query(`
      UPDATE public.venues
      SET location_verification_status = 'verified',
          location_source_url = $2
      WHERE id = $1 AND municipality = 'San Juan'
        AND name = $3
        AND location_verification_status <> 'conflict'
      RETURNING id
    `, [venue.id, source, raw.venue.name]);
    if (verified.rowCount !== 1) throw new Error('Venue no verificable.');

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [venue.id + '|' + startAt]
    );

    const duplicate = await db.query(`
      SELECT id FROM public.events
      WHERE id <> $1 AND start_at = $2
        AND (venue_id = $3 OR LOWER(TRIM(title)) = LOWER(TRIM($4)))
    `, [eventId, startAt, venue.id, raw.name]);
    if (duplicate.rowCount) throw new Error('Posible duplicado.');

    const caption = JSON.stringify(raw);
    const hash = buildSourceContentHash({ captionText: caption });
    const analysis = {
      ...previousAnalysis,
      status: 'approved',
      review_required: false,
      event: {
        ...previousAnalysis.event,
        title: raw.name,
        venue: raw.venue.name,
        venue_id: venue.id,
        municipality: 'San Juan',
        venue_address: raw.venue.street_address,
        event_status: 'EventScheduled',
        normalized: {
          ...previousAnalysis.event.normalized,
          start_at: startAt
        }
      },
      source_sync: {
        method: 'official_event_and_checkout_reconciliation',
        source_hash: hash,
        checked_at: new Date().toISOString(),
        doors_at: doorsAt,
        performance_start_at: startAt,
        api_conflict: 'API retains previous title, venue and time',
        previous_candidate: {
          caption_text: current.caption_text,
          source_content_hash: current.source_content_hash
        },
        previous_event: previous,
        previous_analysis: previousAnalysis
      }
    };

    await db.query(`
      UPDATE public.events
      SET title = $2, description = $3, venue_id = $4,
          start_at = $5, updated_at = NOW()
      WHERE id = $1
    `, [eventId, raw.name, description, venue.id, startAt]);

    await db.query(`
      UPDATE public.event_candidates
      SET caption_text = $2, source_content_hash = $3,
          analysis_result = $4::jsonb
      WHERE id = $1
    `, [candidateId, caption, hash, JSON.stringify(analysis)]);

    console.table([{
      id: eventId,
      titulo: raw.name,
      venue: raw.venue.name,
      puertas_PR: '2026-11-07 20:00',
      inicio_PR: '2026-11-07 21:30'
    }]);

    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(apply ? 'Corrección guardada.' : 'SIMULACIÓN REVERTIDA.');
    console.log('Eventos nuevos: 0');
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
