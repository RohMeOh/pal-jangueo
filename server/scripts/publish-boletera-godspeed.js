'use strict';

const pool = require('../db');
const { extractEventJsonLd } =
  require('../utils/extractEventJsonLd');
const { assessMusicEvidence } =
  require('../utils/assessMusicEvidence');
const { buildSourceContentHash } =
  require('../utils/sourceContentHash');

const SOURCE =
  'https://boletos.boletera.net/e/godspeed-you-black-emperor-en-puerto-rico';
const TICKETS = SOURCE + '/tickets';
const API = 'https://boletera.net/api/events';
const TITLE = 'Godspeed You! Black Emperor en Puerto Rico';
const VENUE = 'La Respuesta';

const DATES = [
  {
    label: 'Jueves | Mar 4, 8PM',
    start_at: '2027-03-05T00:00:00.000Z'
  },
  {
    label: 'Viernes | Mar 5, 8PM',
    start_at: '2027-03-06T00:00:00.000Z'
  }
];

const mode = process.argv[2];

const publish = mode === '--publish';
const validArguments = publish
  ? process.argv.length === 4 &&
    process.argv[3] === '--confirm-ticket-dates'
  : process.argv.length === 3;

if (!['--stage', '--simulate', '--publish'].includes(mode) ||
    !validArguments) {
  throw new Error(
    'Uso: --stage | --simulate | --publish --confirm-ticket-dates'
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null : date.toISOString();
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function get(url, accept) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Accept: accept }
  });

  assert(
    response.ok && response.url === url,
    'Fuente no verificada: ' + url
  );

  const text = await response.text();
  assert(text.length <= 3000000, 'Respuesta demasiado grande');
  return text;
}

function verifyPage(html) {
  const records = extractEventJsonLd(html, SOURCE);

  assert(records.length === 1, 'MusicEvent oficial no único');

  const event = records[0];

  assert(
    event.event_type === 'MusicEvent' &&
    clean(event.name) === TITLE,
    'Título o tipo de evento incorrecto'
  );

  assert(clean(event.venue?.name) === VENUE,
    'Venue incorrecto');

  assert(
    String(event.event_status).split('/').pop() ===
      'EventScheduled',
    'Estado no confirmado'
  );

  assert(
    !event.start_date ||
      DATES.some(date => iso(event.start_date) === date.start_at),
    'Fecha estructurada contradictoria'
  );

  for (const date of DATES) {
    const validOffer = (event.offers || []).some(offer =>
      clean(offer.name) === date.label &&
      offer.price === 32 &&
      offer.url === TICKETS &&
      (!offer.currency || offer.currency === 'USD')
    );

    assert(validOffer,
      'Boletos o precios cambiaron: ' + date.label);
  }

  return event;
}

async function verifyLive() {
  const [detail, tickets, apiText] = await Promise.all([
    get(SOURCE, 'text/html'),
    get(TICKETS, 'text/html'),
    get(API, 'application/json')
  ]);

  const event = verifyPage(detail);
  verifyPage(tickets);

  const catalog = JSON.parse(apiText);
  assert(Array.isArray(catalog), 'API cambió de formato');

  const matches = catalog.filter(item =>
    item?.status === 'published' &&
    (item.external_url === SOURCE || item.ticket_url === TICKETS)
  );

  assert(matches.length === 1, 'Registro API ambiguo');

  const item = matches[0];

  assert(
    clean(item.title) === TITLE && item.multi_day === true,
    'Datos principales de API cambiaron'
  );

  const dates = (item.event_dates || [])
    .map(date => iso(date?.starts_at))
    .sort();

  assert(
    dates.length === 2 &&
    dates.every((date, index) =>
      date === DATES[index].start_at
    ),
    'Las fechas API cambiaron'
  );

  assert(
    iso(item.starts_at) === DATES[0].start_at,
    'Fecha principal API incorrecta'
  );

  assert(
    DATES.every(date => new Date(date.start_at) > new Date()),
    'Alguna función ya venció'
  );

  const music = assessMusicEvidence(event.description_raw);

  assert(
    /post-rock experimental|dos noches de m[uú]sica/i
      .test(music.description),
    'Evidencia musical insuficiente'
  );

  const snapshot = JSON.stringify({
    source_url: SOURCE,
    title: TITLE,
    venue: event.venue,
    event_status: event.event_status,
    description: event.description_raw,
    start_date: event.start_date,
    dates,
    ticket_url: TICKETS,
    offers: DATES.map(date => ({
      name: date.label,
      price: 32
    }))
  });

  return {
    snapshot,
    hash: buildSourceContentHash({
      captionText: snapshot
    }),
    description: music.description.slice(0, 3000)
  };
}

async function main() {
  console.log('\n=== GODSPEED: DOS FUNCIONES ===');
  console.log('Modo:', mode);

  const evidence = await verifyLive();
  const db = await pool.connect();
  let started = false;

  try {
    await db.query('BEGIN');
    started = true;

    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['Boletera|' + SOURCE]
    );

    const venues = await db.query(`
      SELECT id FROM public.venues
      WHERE name = 'La Respuesta'
        AND municipality = 'San Juan'
        AND location_verification_status = 'verified'
      FOR SHARE
    `);

    assert(venues.rowCount === 1,
      'La Respuesta no está verificada');

    const venueId = venues.rows[0].id;

    const sources = await db.query(`
      SELECT id FROM public.sources
      WHERE name = 'Boletera'
      FOR SHARE
    `);

    assert(sources.rowCount === 1,
      'Fuente Boletera no registrada');

    const sourceId = sources.rows[0].id;

    const linked = await db.query(`
      SELECT event_id FROM public.event_sources
      WHERE source_url = $1
    `, [SOURCE]);

    assert(linked.rowCount === 0,
      'La fuente ya tiene eventos publicados');

    const duplicateQuery = `
      SELECT id FROM public.events
      WHERE start_at = ANY($1::timestamptz[])
        AND (
          venue_id = $2
          OR LOWER(TRIM(title)) = LOWER(TRIM($3))
        )
    `;

    const duplicateArgs = [
      DATES.map(date => date.start_at),
      venueId,
      TITLE
    ];

    const duplicates = await db.query(
      duplicateQuery, duplicateArgs
    );

    assert(duplicates.rowCount === 0,
      'Posibles eventos duplicados');

    const existing = await db.query(`
      SELECT * FROM public.event_candidates
      WHERE source_url = $1
        AND is_test = FALSE
      FOR UPDATE
    `, [SOURCE]);

    assert(existing.rowCount <= 1,
      'Candidatos duplicados');

    const candidate = existing.rows[0];

    if (mode === '--stage') {
      if (candidate) {
        assert(
          candidate.source_name === 'Boletera' &&
          candidate.review_status === 'pending_review' &&
          !candidate.approved_event_id &&
          candidate.source_content_hash === evidence.hash,
          'Candidato existente requiere revisión'
        );

        console.log('Candidato reutilizado:', candidate.id);
      } else {
        const analysis = {
          status: 'pending_review',
          review_required: true,
          validation: {
            basic_checks_passed: true,
            safe_to_publish: false
          },
          event: {
            title: TITLE,
            venue: VENUE,
            municipality: 'San Juan',
            normalized: {
              start_at: DATES[0].start_at,
              price_type: 'paid',
              price_min: 32,
              price_max: 32
            },
            event_status: 'EventScheduled',
            ticket_provider: 'Boletera',
            ticket_url: TICKETS
          },
          performance_evidence: {
            dates: DATES,
            source: 'Boletera API y boletos oficiales',
            external_date_conflict: true,
            human_review_required: true
          }
        };

        const inserted = await db.query(`
          INSERT INTO public.event_candidates (
            source_name,
            source_url,
            caption_text,
            source_content_hash,
            analysis_result,
            review_status,
            is_test
          )
          VALUES (
            'Boletera', $1, $2, $3,
            $4::jsonb, 'pending_review', FALSE
          )
          RETURNING id
        `, [
          SOURCE,
          evidence.snapshot,
          evidence.hash,
          JSON.stringify(analysis)
        ]);

        console.log('Candidato guardado:', inserted.rows[0].id);
      }

      await db.query('COMMIT');
      started = false;

      console.log('Publicados: 0');
      return;
    }

    assert(
      candidate &&
      candidate.source_name === 'Boletera' &&
      candidate.review_status === 'pending_review' &&
      !candidate.approved_event_id &&
      candidate.source_content_hash === evidence.hash &&
      buildSourceContentHash({
        captionText: candidate.caption_text
      }) === evidence.hash,
      'Candidato pendiente o hash inválido'
    );

    for (const date of DATES) {
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [venueId + '|' + date.start_at]
      );
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['event-title:' + TITLE.toLowerCase() + '|' + date.start_at]
      );
    }

    const recheck = await db.query(
      duplicateQuery, duplicateArgs
    );

    assert(recheck.rowCount === 0,
      'Duplicado durante simulación');

    const created = [];

    for (const date of DATES) {
      const inserted = await db.query(`
        INSERT INTO public.events (
          title, description, venue_id, start_at,
          status, price_type, price_min, price_max,
          flyer_url, ticket_url, ticket_provider,
          is_published
        )
        VALUES (
          $1, $2, $3, $4,
          'scheduled', 'paid', 32, 32,
          NULL, $5, 'Boletera', TRUE
        )
        RETURNING id
      `, [
        TITLE,
        evidence.description,
        venueId,
        date.start_at,
        TICKETS
      ]);

      created.push({
        id: inserted.rows[0].id,
        start_at: date.start_at
      });

      await db.query(`
        INSERT INTO public.event_sources (
          event_id, source_id, source_url,
          last_checked_at
        )
        VALUES ($1, $2, $3, NOW())
      `, [
        inserted.rows[0].id,
        sourceId,
        SOURCE
      ]);
    }

    const analysis = {
      ...candidate.analysis_result,
      status: 'approved',
      review_required: false,
      validation: {
        basic_checks_passed: true,
        safe_to_publish: true,
        review_required: false
      },
      automatic_publication: {
        method: 'verified_multiple_performances',
        source_content_hash: evidence.hash,
        event_ids: created.map(item => item.id),
        performances: created,
        date_confirmation:
          'Boletera: March 4-5, 2027, 8 PM PR',
        external_conflict:
          'Constellation Records: March 3-4, 2027',
        manual_confirmation: publish
      }
    };

    const updated = await db.query(`
      UPDATE public.event_candidates
      SET review_status = 'approved',
          approved_event_id = $2,
          reviewed_at = NOW(),
          analysis_result = $3::jsonb
      WHERE id = $1
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
      RETURNING id
    `, [
      candidate.id,
      created[0].id,
      JSON.stringify(analysis)
    ]);

    assert(updated.rowCount === 1,
      'No se pudo vincular el candidato');

    console.table(created);

    if (!publish) {
      await db.query('ROLLBACK');
      started = false;

      console.log('SIMULACIÓN COMPLETADA');
      console.log('Transacción revertida');
      console.log('Eventos publicados: 0');
    } else {
      await db.query('COMMIT');
      started = false;

      console.log('DOS FUNCIONES PUBLICADAS');
    }

  } catch (error) {
    if (started) await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

main()
  .catch(error => {
    console.error('ALTO:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
