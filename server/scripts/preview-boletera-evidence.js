// Pa'l Jangueo - Review original event descriptions
// Read-only. Does not save or publish anything.

const { extractEvents } = require('./discover-boletera');

const {
  extractEventJsonLd
} = require('../utils/extractEventJsonLd');

const {
  adaptBoleteraEvent
} = require('../adapters/boleteraAdapter');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const BASE_URL = 'https://boletos.boletera.net/';
const ORIGIN = new URL(BASE_URL).origin;

const scanAll = process.argv.includes('--all');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function getPage(url) {
  const parsed = new URL(url);

  if (parsed.origin !== ORIGIN) {
    throw new Error('Fuente no autorizada para este adaptador.');
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: { Accept: 'text/html' }
  });

  if (
    !response.ok ||
    new URL(response.url).origin !== ORIGIN
  ) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function cleanDescription(value) {
  if (typeof value !== 'string') return null;

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || null;
}

async function main() {
  console.log("\n=== PA'L JANGUEO ===");
  console.log('EVIDENCIAS DE EVENTOS MUSICALES');
  console.log('Modo: SOLO LECTURA\n');

  const homepage = await getPage(BASE_URL);
  const discovered = extractEvents(homepage);

  const selected = scanAll
    ? discovered
    : discovered.slice(0, 10);

  let candidates = 0;
  let missingDescriptions = 0;
  let errors = 0;

  for (const [index, item] of selected.entries()) {
    try {
      const html = await getPage(item.event_url);

      const events = extractEventJsonLd(
        html,
        item.event_url
      );

      if (events.length !== 1) continue;

      const original = events[0];
      const prepared = adaptBoleteraEvent(original);

      if (!prepared.validation.basic_checks_passed) {
        continue;
      }

      candidates++;

      const assessment = assessMusicEvidence(
        original.description_raw
      );

      const description =
        assessment.description.slice(0, 500) || null;

      if (!description) missingDescriptions++;

      console.log('\n---');
      console.log('Evento:', prepared.event.title);
      console.log('Local:', prepared.event.venue);
      console.log('Fecha:', prepared.event.normalized.start_at);
      console.log('URL:', item.event_url);
      console.log(
        'Descripción original:',
        description || 'No disponible'
      );
      console.log(
        'Señales encontradas:',
        assessment.signals.join(', ') || 'Ninguna concluyente'
      );
      console.log(
        'Clasificación preliminar:',
        assessment.classification
      );
      console.log('Música local confirmada: NO');

    } catch (error) {
      errors++;
      console.error('Error:', item.event_url, error.message);
    }

    if (index < selected.length - 1) {
      await sleep(1000);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Candidatos examinados:', candidates);
  console.log('Sin descripción:', missingDescriptions);
  console.log('Errores:', errors);
  console.log('Registros guardados: 0');
  console.log('Eventos publicados: 0');
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
