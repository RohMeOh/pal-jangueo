// Pa'l Jangueo - Evidence-aware Boletera discovery
// Preview by default. --stage saves review candidates only.
// Never approves or publishes events.

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { extractEvents } = require('./discover-boletera');
const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { adaptBoleteraEvent } = require('../adapters/boleteraAdapter');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');

const execFileAsync = promisify(execFile);

const BASE_URL = 'https://boletos.boletera.net/';
const ORIGIN = new URL(BASE_URL).origin;
const MAX_PREVIEW = 10;
const DELAY_MS = 1000;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url) {
  if (new URL(url).origin !== ORIGIN) {
    throw new Error('Fuente no permitida.');
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
    throw new Error(`No se pudo verificar la página: HTTP ${response.status}`);
  }

  return response.text();
}

async function stageCandidate(url) {
  const script = path.join(__dirname, 'stage-boletera-event.js');

  const { stdout } = await execFileAsync(
    process.execPath,
    [script, url, '--stage'],
    {
      cwd: path.join(__dirname, '..'),
      timeout: 60000,
      maxBuffer: 1024 * 1024
    }
  );

  if (stdout.includes('Candidato existente actualizado.')) {
    return 'ACTUALIZADO';
  }

  if (stdout.includes('Candidato revisado: actualización bloqueada.')) {
    return 'OMITIDO';
  }

  if (stdout.includes('Candidato existente reutilizado.')) {
    return 'REUTILIZADO';
  }

  if (stdout.includes('Candidato real guardado para revisión.')) {
    return 'GUARDADO';
  }

  throw new Error('El guardado no devolvió una confirmación reconocida.');
}

async function alreadyPublished(pool, url) {
  const { rows } = await pool.query(`
    SELECT id
    FROM public.event_candidates
    WHERE is_test = FALSE
      AND source_url = $1
      AND approved_event_id IS NOT NULL
    LIMIT 1
  `, [url]);

  return rows.length > 0;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some(arg => !['--all', '--stage'].includes(arg))) {
    throw new Error(
      'Uso: node scripts/run-discovery.js [--all] [--stage]'
    );
  }

  const stage = args.includes('--stage');
  const scanAll = args.includes('--all');

  // Do not enable bulk database writes during initial testing.
  if (stage && scanAll) {
    throw new Error(
      'Guardado masivo deshabilitado por seguridad.'
    );
  }

  console.log("\n=== PA'L JANGUEO - DISCOVERY ===");
  console.log('Modo:', stage ? 'GUARDAR PARA REVISIÓN' : 'VISTA PREVIA');

  const homepage = await fetchPage(BASE_URL);
  const discovered = extractEvents(homepage);

  const selected = scanAll
    ? discovered
    : discovered.slice(0, MAX_PREVIEW);

  console.log('Enlaces descubiertos:', discovered.length);
  console.log('Enlaces a analizar:', selected.length);

  const totals = {
    musicEvidence: 0,
    needsReview: 0,
    notEligible: 0,
    skippedPublished: 0,
    saved: 0,
    reused: 0,
    updated: 0,
    skippedReviewed: 0,
    errors: 0
  };

  const pool = stage ? require('../db') : null;

  try {
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
          totals.needsReview++;
          console.log('Resultado: requiere otra extracción');
          continue;
        }

        const raw = events[0];
        const prepared = adaptBoleteraEvent(raw);
        const assessment = assessMusicEvidence(raw.description_raw);

        console.log('Evento:', prepared.event.title);
        console.log('Local:', prepared.event.venue);
        console.log('Fecha:', prepared.event.normalized.start_at);
        console.log('Clasificación:', assessment.classification);

        if (!prepared.validation.basic_checks_passed) {
          totals.notEligible++;
          console.log('Resultado: requisitos básicos incompletos');
          continue;
        }

        const startDate = new Date(
          prepared.event.normalized?.start_at || ''
        );

        if (
          Number.isNaN(startDate.getTime()) ||
          startDate <= new Date()
        ) {
          totals.notEligible++;
          console.log('Resultado: evento pasado o fecha inválida');
          continue;
        }

        if (!assessment.has_musical_program_evidence) {
          totals.needsReview++;
          console.log('Resultado: evidencia musical insuficiente');
          console.log('Guardado automático: NO');
          continue;
        }

        totals.musicEvidence++;

        console.log('Resultado: candidato con indicios musicales');
        console.log('Música local confirmada: NO');
        console.log('Publicación autorizada: NO');

        if (stage) {
          if (await alreadyPublished(pool, item.event_url)) {
            totals.skippedPublished++;
            console.log('Supabase: ya vinculado a evento aprobado');
            continue;
          }

          const outcome = await stageCandidate(item.event_url);

          if (outcome === 'GUARDADO') {
            totals.saved++;
          } else if (outcome === 'REUTILIZADO') {
            totals.reused++;
          } else if (outcome === 'ACTUALIZADO') {
            totals.updated++;
          } else if (outcome === 'OMITIDO') {
            totals.skippedReviewed++;
          }

          console.log('Supabase:', outcome);
          console.log('Estado: pending_review o estado existente');
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
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Con indicios musicales:', totals.musicEvidence);
  console.log('Necesitan otra revisión:', totals.needsReview);
  console.log('No elegibles:', totals.notEligible);
  console.log('Ya aprobados:', totals.skippedPublished);
  console.log('Candidatos nuevos guardados:', totals.saved);
  console.log('Candidatos reutilizados:', totals.reused);
  console.log('Candidatos actualizados:', totals.updated);
  console.log('Candidatos revisados omitidos:', totals.skippedReviewed);
  console.log('Errores:', totals.errors);
  console.log('Eventos publicados automáticamente: 0');

  if (!stage) {
    console.log('Modo solo lectura: Supabase no fue modificado.');
  }

  if (totals.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
