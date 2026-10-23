// Pa'l Jangueo - Inspect Ticketera event structure.
// Read-only. No database writes or Gemini calls.

const { detectTicketeraChallenge } = require('../utils/detectTicketeraChallenge');

const URLS = [
  'https://www.ticketera.com/events/detail/noche-emo-halloween',
  'https://www.ticketera.com/events/detail/fiel-a-la-vega',
  'https://www.ticketera.com/events/detail/la-postal-microdrama-world-premiere'
];

function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  );

  return match?.[2] || null;
}

function textOnly(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function inspect(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  if (detectTicketeraChallenge(html)) {
    console.log('Acceso restringido por Ticketera:', url);
    return;
  }

  console.log('\n====================================');
  console.log('URL:', url);
  console.log('HTML recibido:', html.length, 'caracteres');

  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);

  console.log(
    'Título H1:',
    heading ? textOnly(heading[1]) : 'No encontrado'
  );

  console.log('\n--- METADATOS ---');

  const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)];

  for (const [tag] of metadata) {
    const name = attribute(tag, 'property') ||
      attribute(tag, 'name');

    if (
      !name ||
      !/^(og:|twitter:|description$)/i.test(name)
    ) {
      continue;
    }

    const value = attribute(tag, 'content');

    if (value) {
      console.log(`${name}: ${value.slice(0, 250)}`);
    }
  }

  console.log('\n--- DATOS ESTRUCTURADOS ---');

  const scripts = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)
  ];

  let jsonLdCount = 0;

  for (const script of scripts) {
    if (!/type\s*=\s*["']application\/ld\+json["']/i
      .test(script[0].split('>')[0])) {
      continue;
    }

    jsonLdCount++;

    try {
      const data = JSON.parse(script[1]);

      console.log(
        'JSON-LD:',
        JSON.stringify(data).slice(0, 1800)
      );
    } catch {
      console.log('JSON-LD presente pero no parseable.');
    }
  }

  console.log('Bloques JSON-LD:', jsonLdCount);

  console.log('\n--- CAMPOS VISIBLES ---');

  const text = textOnly(html);

  for (const field of [
    'Inicio del Evento',
    'Lugar',
    'Puertas Abren',
    'Detalles del Evento'
  ]) {
    const position = text.indexOf(field);

    console.log(
      `${field}:`,
      position >= 0
        ? text.slice(position, position + 220)
        : 'No encontrado'
    );
  }
}

async function main() {
  console.log('=== INSPECCIÓN DE TICKETERA ===');

  for (const url of URLS) {
    try {
      await inspect(url);
    } catch (error) {
      console.error('Error:', url, error.message);
      process.exitCode = 1;
    }
  }

  console.log('\nCambios en Supabase: 0');
  console.log('Gemini utilizado: NO');
  console.log('Eventos publicados: 0');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
