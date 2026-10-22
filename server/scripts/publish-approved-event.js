const pool = require('../db');

const eventId = process.argv[2];
const publish = process.argv.includes('--publish');

async function main() {
  try {
    const { rows } = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.start_at,
        e.status,
        e.is_published,
        e.ticket_url,
        v.name AS venue,
        v.location_verification_status,
        EXISTS (
          SELECT 1
          FROM public.event_candidates c
          WHERE c.approved_event_id = e.id
            AND c.review_status = 'approved'
            AND c.is_test = FALSE
        ) AS approved,
        EXISTS (
          SELECT 1
          FROM public.event_sources es
          JOIN public.sources s ON s.id = es.source_id
          WHERE es.event_id = e.id
            AND s.name = 'Boletera'
        ) AS source_verified
      FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id
      WHERE e.id = $1
    `, [eventId]);

    if (rows.length !== 1) {
      throw new Error('Evento no encontrado.');
    }

    const event = rows[0];

    console.log('=== PA’L JANGUEO ===');
    console.log('PUBLICACIÓN DE EVENTOS\n');
    console.log('Evento:', event.title);
    console.log('Local:', event.venue);
    console.log('Aprobado:', event.approved);
    console.log('Fuente vinculada:', event.source_verified);
    console.log('Local verificado:',
      event.location_verification_status);
    console.log('Actualmente publicado:', event.is_published);

    const ready =
      event.approved &&
      event.source_verified &&
      event.location_verification_status === 'verified' &&
      event.status === 'scheduled' &&
      new Date(event.start_at) > new Date() &&
      Boolean(event.ticket_url);

    if (!ready) {
      throw new Error(
        'El evento no cumple los requisitos de publicación.'
      );
    }

    if (!publish) {
      console.log('\nLISTO PARA PUBLICACIÓN MANUAL');
      console.log('Registros modificados: 0');
      return;
    }

    const result = await pool.query(`
      UPDATE public.events e
      SET
        is_published = TRUE,
        updated_at = NOW()
      WHERE e.id = $1
        AND e.is_published = FALSE
        AND e.status = 'scheduled'
        AND e.start_at > NOW()
        AND e.ticket_url IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.venues v
          WHERE v.id = e.venue_id
            AND v.location_verification_status = 'verified'
        )
        AND EXISTS (
          SELECT 1
          FROM public.event_candidates c
          WHERE c.approved_event_id = e.id
            AND c.review_status = 'approved'
            AND c.is_test = FALSE
        )
        AND EXISTS (
          SELECT 1
          FROM public.event_sources es
          JOIN public.sources s ON s.id = es.source_id
          WHERE es.event_id = e.id
            AND s.name = 'Boletera'
        )
      RETURNING id, title, is_published
    `, [eventId]);

    if (result.rowCount !== 1) {
      throw new Error(
        'La publicación no se completó. Revisa el estado del evento.'
      );
    }

    console.log('\nEVENTO PUBLICADO CORRECTAMENTE');
    console.table(result.rows);

  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
