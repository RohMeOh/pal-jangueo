// Pa'l Jangueo - Venue discovery with shared validation
// Read-only. No database writes or publishing.

const {
  adaptVenueEvent
} = require('../adapters/venueAdapter');

const LISTING_URL = 'https://www.cocacolamusichall.com/events';
const VENUE_ORIGIN = 'https://www.cocacolamusichall.com';
const EVENT_PATH = '/events/detail/';
const MAX_EVENTS = 10;

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: {
      Accept: 'text/html'
    }
  });

  if (
    !response.ok ||
    new URL(response.url).origin !== VENUE_ORIGIN
  ) {
    throw new Error('No se pudo verificar la página.');
  }

  return response.text();
}

function discoverLinks(html) {
  const links = new Set();

  const matches = html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi
  );

  for (const match of matches) {
    try {
      const url = new URL(
        match[2].replace(/&amp;/g, '&'),
        LISTING_URL
      );

      if (
        url.origin !== VENUE_ORIGIN ||
        !url.pathname.startsWith(EVENT_PATH)
      ) {
        continue;
      }

      url.search = '';
      url.hash = '';

      links.add(url.href);
    } catch {
      // Ignore invalid links.
    }
  }

  return [...links];
}

const {
  extractCocaColaShowings
} = require('../utils/extractCocaColaShowings');

function extractDetails(html, url) {
  const page = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const heading = page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = heading ? cleanText(heading[1]) : null;

  return extractCocaColaShowings(html).map(showing => ({
    title, ...showing, url
  }));
}

async function main() {
  console.log("\n=== PA'L JANGUEO ===");
  console.log('VENUE DISCOVERY + SHARED VALIDATION');
  console.log('Modo: SOLO LECTURA\n');

  const listingHtml = await fetchPage(LISTING_URL);
  const links = discoverLinks(listingHtml);
  const selected = links.slice(0, MAX_EVENTS);

  console.log('Venue: Coca-Cola Music Hall');
  console.log('Enlaces descubiertos:', links.length);
  console.log('Eventos a procesar:', selected.length);

  let processed = 0;
  let pending = 0;
  let errors = 0;

  for (const url of selected) {
    console.log('\n---');

    try {
      const html = await fetchPage(url);
      const performances = extractDetails(html, url);
      if (!performances.length) {
        pending++;
        console.warn(
          'PENDIENTE: funciones sin fecha y hora confirmadas:',
          url
        );
        continue;
      }

      for (const details of performances) {
      const result = adaptVenueEvent(details);

      processed++;

      console.log('Evento:', result.event.title);
      console.log('Fecha original:', details.date);
      console.log('Hora original:', details.time);
      console.log(
        'Fecha UTC:',
        result.event.normalized.start_at
      );
      console.log('Fuente:', result.source.name);
      console.log('URL:', result.source.url);
      console.log('Estado:', result.status);
      console.log(
        'Problemas:',
        result.validation.issues.map(issue => issue.code)
      );
      console.log('Música local confirmada: NO');
      console.log('Publicación autorizada: NO');
      }

    } catch (error) {
      errors++;
      console.error('Error:', error.message);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Eventos procesados:', processed);
  console.log('Fichas pendientes:', pending);
  console.log('Errores:', errors);
  console.log('Registros guardados: 0');
  console.log('Eventos publicados: 0');
  console.log('Modo: SOLO LECTURA');

  if (selected.length > 0 && processed === 0) {
    console.error(
      'ERROR: Ninguna función confirmada; revisar el extractor.'
    );
    process.exitCode = 1;
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
