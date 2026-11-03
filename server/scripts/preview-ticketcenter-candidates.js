const pool = require('../db');
const catalog = require('/tmp/ticketcenter-details.json');

const aliases = {
  'musas eventos cba santurce': '1a354618-a703-4479-a8f5-accf8191468c',
  'sala sinfonica pablo casals': '905c581a-a4dd-4d83-aae4-bea12c5a5b16',
  'sala de teatro rene marques santurce': '0b0396d9-27b0-406a-a041-11cf0f506021',
  'sala de festivales antonio paoli santurce': '75b6985f-998a-4504-b980-648d62fa56e2',
  'sala experimental carlos marichal': '8307ceab-6c07-4380-8cd7-6e261e804549',
  'fundacion nacional para la cultura': '3306e371-568e-4297-9b70-cfb74ebf4562',
  'hollywood cafe ponce': 'cbde1ca9-ef85-439f-89c4-94dd504f97b7',
  'monero cafe teatro y bar': '15dcd01e-8606-47d4-a46a-d2322a7f5b95'
};

function normalize(value) {
  return String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  if (catalog.detail_errors?.length || catalog.details_complete !== true) {
    throw new Error('La extracción tiene fichas pendientes.');
  }

  const { rows } = await pool.query(`
    SELECT id, name, municipality, location_verification_status
    FROM public.venues
  `);
  const venues = new Map(rows.map(v => [v.id, v]));
  const summary = [];
  const totals = {};

  for (const event of catalog.events) {
    const title = normalize(event.title);
    const upcoming = event.performances.filter(
      p => Date.parse(p.start_at) > Date.now()
    );
    if (!upcoming.length) continue;

    // Exclusiones por el espectáculo, nunca por el nombre del venue.
    const outsideScope =
      /\bcascanueces\b|\bmaestra vida\b|\bles miserables\b|\bspelling bee\b/.test(title) ||
      title === 'toc toc' ||
      title === 'la fiesta del divorcio' ||
      title === 'los gomes vs los latorre';

    for (const performance of upcoming) {
      const alias = normalize(performance.venue_name);
      const venue = venues.get(aliases[alias]);
      let status;

      if (outsideScope) {
        status = 'FUERA_DE_ALCANCE_TEATRO_BALLET';
      } else if (title.startsWith('alma de tango')) {
        status = 'REVISAR_CONFLICTO_FECHA';
      } else if (event.source_conflict) {
        status = 'REVISAR_CONFLICTO_FUENTE';
      } else if (
        !venue ||
        venue.location_verification_status !== 'verified'
      ) {
        status = 'PENDIENTE_VENUE';
      } else if (
        !event.music.has_musical_program_evidence ||
        event.music.non_music_event_detected ||
        event.music.mixed_event_detected
      ) {
        status = 'REVISAR_EVIDENCIA_MUSICAL';
      } else {
        status = 'PREPARABLE_PARA_REVISION';
      }

      totals[status] = (totals[status] || 0) + 1;
      summary.push({
        evento: event.title,
        fecha: performance.start_at,
        venue: venue?.name || performance.venue_name,
        municipio: venue?.municipality || 'PENDIENTE',
        estado: status
      });
    }
  }

  console.table(summary);
  console.log('\n=== TOTALES POR FUNCIÓN ===');
  console.table(totals);
  console.log('Funciones revisadas:', summary.length);
  console.log('Cambios en Supabase: 0');
  console.log('Eventos publicados: 0');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
