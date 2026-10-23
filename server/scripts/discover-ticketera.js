// Pa'l Jangueo - Ticketera concert discovery.
// Read-only. No Gemini, database writes or publishing.

const { detectTicketeraChallenge } = require('../utils/detectTicketeraChallenge');

const LIST_URL =
  'https://www.ticketera.com/events/category/conciertos';

const ORIGIN = 'https://www.ticketera.com';
const MAX_PREVIEW = 20;

function extractEventLinks(html) {
  const links = new Set();

  const anchorRegex =
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gis;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[2].replace(/&amp;/gi, '&');

    try {
      const url = new URL(href, ORIGIN);

      if (url.origin !== ORIGIN) continue;

      if (!/^\/events\/detail\/[a-z0-9-]+\/?$/i.test(
        url.pathname
      )) continue;

      links.add(ORIGIN + url.pathname.replace(/\/$/, ''));
    } catch {
      continue;
    }
  }

  return [...links];
}

async function main() {
  console.log('\n=== TICKETERA - DESCUBRIMIENTO ===');
  console.log('Modo: SOLO LECTURA');
  console.log('Fuente:', LIST_URL);

  const response = await fetch(LIST_URL, {
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
    headers: {
      Accept: 'text/html'
    }
  });

  if (!response.ok) {
    throw new Error(`Ticketera respondió HTTP ${response.status}`);
  }

  const html = await response.text();

  if (detectTicketeraChallenge(html)) {
    throw new Error('Ticketera requiere verificación de acceso.');
  }

  const links = extractEventLinks(html);

  console.log('Enlaces encontrados:', links.length);

  for (const [index, url] of links
    .slice(0, MAX_PREVIEW).entries()) {
    console.log(`${index + 1}. ${url}`);
  }

  if (links.length === 0) {
    throw new Error(
      'No se encontraron enlaces. Revisar el HTML de Ticketera.'
    );
  }

  console.log('\nGemini utilizado: NO');
  console.log('Candidatos guardados: 0');
  console.log('Eventos publicados: 0');
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
