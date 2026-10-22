// Pa'l Jangueo - Boletera event discovery prototype

const BASE_URL = 'https://boletos.boletera.net/';

function extractEvents(html) {
  const events = new Map();

  const matches = html.matchAll(
    /href\s*=\s*["']([^"']+)["']/gi
  );

  for (const match of matches) {
    let url;

    try {
      url = new URL(match[1], BASE_URL);
    } catch {
      continue;
    }

    if (url.origin !== new URL(BASE_URL).origin) {
      continue;
    }

    const path = url.pathname.replace(/\/$/, '');

    const isEvent = /^\/e\/[^/]+$/.test(path);
    const isTickets = /^\/e\/[^/]+\/tickets$/.test(path);

    if (!isEvent && !isTickets) {
      continue;
    }

    const eventPath = path.replace(/\/tickets$/, '');
    const eventUrl = new URL(eventPath, BASE_URL).href;

    if (!events.has(eventUrl)) {
      events.set(eventUrl, {
        source: 'Boletera',
        event_url: eventUrl,
        ticket_url: null,
        music_status: 'needs_review'
      });
    }

    if (isTickets) {
      events.get(eventUrl).ticket_url = url.origin + path;
    }
  }

  return [...events.values()];
}

async function main() {
  const response = await fetch(BASE_URL, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'text/html'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const events = extractEvents(html);

  console.log('=== PA’L JANGUEO: BOLETERA ===');
  console.log('Eventos únicos:', events.length);

  console.log(
    'Con enlace de boletos:',
    events.filter(event => event.ticket_url).length
  );

  console.log('\nPrimeros 10 eventos:\n');

  for (const event of events.slice(0, 10)) {
    console.log('Evento:', event.event_url);
    console.log('Boletos:', event.ticket_url || 'No encontrado');
    console.log('Música:', event.music_status);
    console.log('---');
  }

  console.log('\nSolo lectura. No se guardaron eventos.');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { extractEvents };
