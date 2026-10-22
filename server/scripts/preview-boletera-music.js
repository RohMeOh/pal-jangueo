// Pa'l Jangueo - Preview music events from Boletera
// Read-only prototype. Does not call Gemini or Supabase.

const { extractEvents } = require('./discover-boletera');

const {
  extractEventJsonLd
} = require('../utils/extractEventJsonLd');

const CATALOG_URL = 'https://boletos.boletera.net/';
const MAX_EVENTS = 6;

async function getHtml(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function main() {
  console.log('=== PA’L JANGUEO ===');
  console.log('Descubrimiento de eventos musicales\n');

  const catalogHtml = await getHtml(CATALOG_URL);
  const discovered = extractEvents(catalogHtml);

  console.log('Eventos únicos encontrados:', discovered.length);
  console.log('Páginas a examinar:', Math.min(
    MAX_EVENTS, discovered.length
  ));

  let musicCount = 0;
  let otherCount = 0;
  let errorCount = 0;

  for (const item of discovered.slice(0, MAX_EVENTS)) {
    console.log('\n---');
    console.log('Revisando:', item.event_url);

    try {
      const html = await getHtml(item.event_url);

      const events = extractEventJsonLd(
        html,
        item.event_url
      );

      if (events.length === 0) {
        otherCount++;
        console.log('Sin MusicEvent en JSON-LD.');
        console.log('Clasificación pendiente.');
        continue;
      }

      for (const event of events) {
        musicCount++;

        const prices = event.offers
          .filter(offer => offer.price !== null)
          .map(offer => offer.price);

        console.log('MÚSICA DETECTADA');
        console.log('Nombre:', event.name);
        console.log('Fecha:', event.start_date);
        console.log('Local:', event.venue.name);
        console.log(
          'Municipio:',
          event.venue.municipality
        );
        console.log(
          'Precios publicados:',
          prices.length ? prices.join(', ') : 'Desconocidos'
        );
        console.log(
          'Boletos:',
          event.ticket_url || 'No encontrado'
        );
        console.log('Requiere revisión: Sí');
      }

    } catch (error) {
      errorCount++;
      console.log('No se pudo examinar:', error.message);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('MusicEvent detectados:', musicCount);
  console.log('Sin MusicEvent:', otherCount);
  console.log('Errores:', errorCount);
  console.log('Publicados: 0');
  console.log('Guardados en Supabase: 0');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exitCode = 1;
});
