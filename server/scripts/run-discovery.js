// Pa'l Jangueo - Boletera discovery pipeline
// Preview by default. Staging requires --stage.
// Never approves or publishes events.

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { extractEvents } = require('./discover-boletera');
const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { adaptBoleteraEvent } = require('../adapters/boleteraAdapter');

const execFileAsync = promisify(execFile);

const BASE_URL = 'https://boletos.boletera.net/';
const ORIGIN = new URL(BASE_URL).origin;
const DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' }
  });

  if (
    !response.ok ||
    new URL(response.url).origin !== ORIGIN
  ) {
    throw new Error('No se pudo verificar la página de Boletera.');
  }

  return response.text();
}

async function stageCandidate(url) {
  const script = path.join(
    __dirname,
    'stage-boletera-event.js'
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [script, url, '--stage'],
    {
      cwd: path.join(__dirname, '..'),
      timeout: 60000,
      maxBuffer: 1024 * 1024
    }
  );

  return stdout.includes('Candidato existente reutilizado.')
    ? 'REUTILIZADO'
    : 'GUARDADO PARA REVISIÓN';
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some(arg => !['--stage', '--all'].includes(arg))) {
    throw new Error(
      'Uso: node scripts/run-discovery.js [--all] [--stage]'
    );
  }

  const stage = args.includes('--stage');
  const scanAll = args.includes('--all');

  console.log("\n=== PA'L JANGUEO - DISCOVERY ===");
  console.log('Modo:', stage ? 'GUARDAR CANDIDATOS' : 'VISTA PREVIA');

  const homepage = await fetchPage(BASE_URL);
  const discovered = extractEvents(homepage);
  const selected = scanAll
    ? discovered
    : discovered.slice(0, 10);

  console.log('Enlaces descubiertos:', discovered.length);
  console.log('Enlaces a analizar:', selected.length);

  const totals = {
    possible: 0,
    additionalReview: 0,
    ineligible: 0,
    staged: 0,
    errors: 0
  };

  for (const [index, item] of selected.entries()) {
    console.log(`\n--- ${index + 1}/${selected.length} ---`);
    console.log('URL:', item.event_url);

    try {
      const html = await fetchPage(item.event_url);
      const events = extractEventJsonLd(
        html,
        item.event_url
      );

      if (events.length !== 1) {
        totals.additionalReview++;
        console.log('Resultado: necesita otra extracción');
        continue;
      }

      const prepared = adaptBoleteraEvent(events[0]);

      console.log('Título:', prepared.event.title);
      console.log('Local:', prepared.event.venue);
      console.log(
        'Fecha:',
        prepared.event.normalized.start_at
      );

      if (!prepared.validation.basic_checks_passed) {
        totals.ineligible++;
        console.log('Resultado: faltan requisitos básicos');
        console.log(
          'Problemas:',
          prepared.validation.issues.map(x => x.code)
        );
        continue;
      }

      totals.possible++;

      console.log('Resultado: candidato para revisión');
      console.log('Música local confirmada: NO');
      console.log('Publicación autorizada: NO');

      if (stage) {
        const outcome = await stageCandidate(item.event_url);
        totals.staged++;
        console.log('Supabase:', outcome);
      }

    } catch (error) {
      totals.errors++;
      console.error('Error:', error.message);
    } finally {
      if (index < selected.length - 1) {
        await sleep(DELAY_MS);
      }
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Posibles candidatos:', totals.possible);
  console.log('Requieren otra extracción:', totals.additionalReview);
  console.log('No elegibles:', totals.ineligible);
  console.log('Errores:', totals.errors);
  console.log('Candidatos procesados para guardado:', totals.staged);
  console.log('Eventos publicados automáticamente: 0');

  if (!stage) {
    console.log('Modo solo lectura: Supabase no fue modificado.');
  }

  console.log(
    'IMPORTANTE: MusicEvent no confirma música local.'
  );
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
