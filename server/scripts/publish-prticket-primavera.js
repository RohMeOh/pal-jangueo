'use strict';

const pool = require('../db');

const {
  LIST_URL, fetchHtml, extractCards, extractDetail
} = require('./discover-prticket');

const {
  normalizePrticketEvent
} = require('../utils/normalizePrticketEvent');

const {
  extractPrticketPerformances
} = require('../utils/extractPrticketPerformances');

const {
  planTicketVenue
} = require('../utils/ticketVenueRegistry');

const {
  requireVerifiedPrticketVenue
} = require('../utils/requireVerifiedPrticketVenue');

const {
  assessTicketPublication
} = require('../utils/assessTicketPublication');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

const mode = process.argv[2];

if (
  !['--simulate', '--publish'].includes(mode) ||
  process.argv.length !== 3
) {
  throw new Error(
    'Uso: --simulate o --publish'
  );
}

const URL =
  'https://boletos.prticket.com/events/es/primavera';

const TITLE = 'Primavera : Dianne de Jesús';
const VENUE = 'Centro de Bellas Artes de Santurce';

const DATES = [
  '2027-01-22T23:00:00.000Z',
  '2027-01-23T22:00:00.000Z'
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function trustedFlyer(value) {
  if (!value) return null;

  try {
    const url = new globalThis.URL(value);

    if (
      url.protocol === 'https:' &&
      url.hostname === 'dgxrvn37x26wa.cloudfront.net' &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    // No usar imágenes con URL inválida.
  }

  return null;
}

async function main() {
  console.log('\n=== PRIMAVERA: DOS FUNCIONES ===');
  console.log('Modo:', mode);

  // Comprobar que el evento sigue en el listado oficial.
  const cards = extractCards(await fetchHtml(LIST_URL));

  const matching = cards.filter(
    card => card.source_url === URL
  );

  if (
    matching.length !== 1 ||
    normalize(matching[0].title) !== normalize(TITLE)
  ) {
    throw new Error(
      'Primavera no coincide con el listado oficial.'
    );
  }

  // Volver a obtener fechas y descripción oficiales.
  const html = await fetchHtml(URL);
  const detail = extractDetail(html);

  const sessions = extractPrticketPerformances(html);

  const live = normalizePrticketEvent(
    matching[0], detail
  );

  // Este evento tiene dos funciones oficiales.
  // Cada fecha y hora se valida individualmente más abajo.
  if (
    detail.page_title !== TITLE + ' - ' + VENUE ||
    !html.includes('Carlos Marichal') ||
    normalize(live.title) !== normalize(TITLE) ||
    normalize(live.venue) !== normalize(VENUE) ||
    sessions.length !== 2 ||
    sessions.some(
      (item, index) => item.start_at !== DATES[index]
    ) ||
    sessions.some(
      item => new Date(item.start_at) <= new Date()
    )
  ) {
    throw new Error(
      'Fechas, venue o datos oficiales cambiaron.'
    );
  }

  const description = detail.description_evidence || '';

  // Cada función debe cumplir la política musical.
  const assessments = sessions.map(session =>
    assessTicketPublication({
      event: {
        title: TITLE,
        venue: VENUE,
        source_url: URL,
        event_status: 'EventScheduled',
        normalized: {
          start_at: session.start_at,
          price_type: 'unknown',
          price_min: null,
          price_max: null
        }
      },
      description,
      verification: {
        source_status: 'verified',
        venue_status: 'verified',
        duplicate_status: 'clear',
        conflict_status: 'clear'
      }
    })
  );

  for (const result of assessments) {
    if (!result.policy.eligible_for_auto_publication) {
      throw new Error(
        'Política musical: ' +
        result.policy.blockers.join(', ')
      );
    }
  }

  const plan = planTicketVenue({
    sourceName: 'PRticket',
    sourceUrl: URL,
    venueName: VENUE,
    municipality: 'San Juan'
  });

  const flyer = trustedFlyer(
    detail.poster_url || live.poster_url
  );

  const db = await pool.connect();
  let transaction = false;

  try {
    await db.query('BEGIN');
    transaction = true;

    // Evitar operaciones simultáneas sobre esta fuente.
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['PRticket|' + URL]
    );

    // Bloquear y verificar el candidato original.
    const candidates = await db.query(`
      SELECT *
      FROM public.event_candidates
      WHERE source_name = 'PRticket'
        AND source_url = $1
        AND is_test = FALSE
      FOR UPDATE
    `, [URL]);

    if (candidates.rowCount !== 1) {
      throw new Error(
        'Se esperaba exactamente un candidato.'
      );
    }

    const candidate = candidates.rows[0];
    const stored = candidate.analysis_result?.event || {};

    if (
      candidate.review_status !== 'pending_review' ||
      candidate.approved_event_id !== null ||
      !candidate.source_content_hash ||
      candidate.source_content_hash !==
        buildSourceContentHash({
          captionText: candidate.caption_text
        }) ||
      normalize(stored.title) !== normalize(TITLE) ||
      normalize(stored.venue) !== normalize(VENUE) ||
      stored.normalized?.start_at !== DATES[1]
    ) {
      throw new Error(
        'El candidato cambió o su evidencia no coincide.'
      );
    }

    // Exigir el venue certificado en Supabase.
    const venue = await requireVerifiedPrticketVenue(
      db, plan, { lock: true }
    );

    const sources = await db.query(`
      SELECT id
      FROM public.sources
      WHERE name = 'PRticket'
      FOR SHARE
    `);

    if (sources.rowCount !== 1) {
      throw new Error(
        'La fuente PRticket no está registrada correctamente.'
      );
    }

    // No publicar si alguna función de la URL ya existe.
    const linked = await db.query(`
      SELECT event_id
      FROM public.event_sources
      WHERE source_url = $1
      LIMIT 1
    `, [URL]);

    if (linked.rowCount) {
      throw new Error(
        'La URL ya está vinculada a un evento.'
      );
    }

    // Verificar ambas fechas ANTES de crear eventos.
    for (const session of sessions) {
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [venue.id + '|' + session.start_at]
      );

      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [
          'event-title:' +
          normalize(TITLE) + '|' + session.start_at
        ]
      );

      const duplicate = await db.query(`
        SELECT id
        FROM public.events
        WHERE start_at = $1
          AND (
            venue_id = $2
            OR LOWER(TRIM(title)) =
               LOWER(TRIM($3))
          )
        LIMIT 1
      `, [session.start_at, venue.id, TITLE]);

      if (duplicate.rowCount) {
        throw new Error(
          'Posible duplicado: ' + session.start_at
        );
      }
    }

    // Ambas funciones se crean en la MISMA transacción.
    const created = [];

    for (const session of sessions) {
      const inserted = await db.query(`
        INSERT INTO public.events (
          title, description, venue_id, start_at,
          status, price_type, price_min, price_max,
          flyer_url, ticket_url, ticket_provider,
          is_published
        )
        VALUES (
          $1, $2, $3, $4,
          'scheduled', 'unknown', NULL, NULL,
          $5, $6, 'PRticket', TRUE
        )
        RETURNING id
      `, [
        TITLE,
        description,
        venue.id,
        session.start_at,
        flyer,
        URL
      ]);

      const eventId = inserted.rows[0].id;

      created.push({
        id: eventId,
        start_at: session.start_at
      });

      // Cada función comparte la URL de PRticket.
      await db.query(`
        INSERT INTO public.event_sources (
          event_id, source_id, source_url,
          last_checked_at
        )
        VALUES ($1, $2, $3, NOW())
      `, [
        eventId,
        sources.rows[0].id,
        URL
      ]);
    }

    // El candidato original corresponde a la segunda fecha.
    const originalEvent = created.find(
      event => event.start_at === DATES[1]
    );

    if (created.length !== 2 || !originalEvent) {
      throw new Error(
        'No se prepararon ambas funciones.'
      );
    }

    // Guardar ambas referencias sin perder el candidato.
    const analysis = {
      ...candidate.analysis_result,
      status: 'approved',
      review_required: false,
      event: {
        ...stored,
        is_music_event: true,
        event_status: 'EventScheduled'
      },
      verification: {
        ...candidate.analysis_result?.verification,
        source_page_extracted: true,
        musical_program_verified: true,
        venue_verified: true,
        venue_source_confirmed: true
      },
      validation: {
        ...candidate.analysis_result?.validation,
        basic_checks_passed: true,
        safe_to_publish: true,
        review_required: false
      },
      automatic_publication: {
        method: 'verified_multiple_performances',
        checked_at: new Date().toISOString(),
        source_url: URL,
        source_content_hash:
          candidate.source_content_hash,
        music_classification:
          assessments[0].music.classification,
        venue_id: venue.id,
        event_ids: created.map(item => item.id),
        performances: created,
        safe_to_publish: true
      }
    };

    const updated = await db.query(`
      UPDATE public.event_candidates
      SET review_status = 'approved',
          approved_event_id = $1,
          reviewed_at = NOW(),
          analysis_result = $3::jsonb
      WHERE id = $2
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
        AND is_test = FALSE
      RETURNING id
    `, [
      originalEvent.id,
      candidate.id,
      JSON.stringify(analysis)
    ]);

    if (updated.rowCount !== 1) {
      throw new Error(
        'No se pudo vincular el candidato.'
      );
    }

    console.log('\n=== FUNCIONES PREPARADAS ===');
    console.table(created);

    if (mode === '--simulate') {
      await db.query('ROLLBACK');
      transaction = false;

      console.log('\n✓ SIMULACIÓN COMPLETADA');
      console.log('✓ Transacción revertida');
      console.log('✓ Eventos publicados: 0');
      console.log('✓ Cambios permanentes: 0');
    } else {
      await db.query('COMMIT');
      transaction = false;

      console.log('\n✓ AMBAS FUNCIONES PUBLICADAS');
    }

  } catch (error) {
    if (transaction) {
      await db.query('ROLLBACK');
    }
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
