// Pa'l Jangueo - Batch artist enrichment
// Read-only by default. --save enables Gemini and evidence storage.
// Maximum two new analyses per run. Never approves or publishes.

const pool = require('../db');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const MAX_NEW_ANALYSES = 2;
const args = process.argv.slice(2);

if (args.some(arg => arg !== '--save')) {
  console.error('Uso: node scripts/enrich-pending-artists.js [--save]');
  process.exit(1);
}

const save = args.includes('--save');

async function main() {
  const { rows } = await pool.query(`
    SELECT
      id,
      source_url,
      source_content_hash,
      analysis_result
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND is_test = FALSE
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
    ORDER BY id
    LIMIT 100
  `);

  console.log('\n=== ENRIQUECIMIENTO AUTOMÁTICO ===');
  console.log('Modo:', save ? 'GUARDAR EVIDENCIAS' : 'VISTA PREVIA');

  let cached = 0;
  let past = 0;
  let selected = 0;
  let errors = 0;

  for (const candidate of rows) {
    const analysis = candidate.analysis_result || {};
    const date = new Date(
      analysis.event?.normalized?.start_at || ''
    );

    if (
      Number.isNaN(date.getTime()) ||
      date <= new Date()
    ) {
      past++;
      continue;
    }

    if (
      analysis.artist_extraction?.source_content_hash ===
      candidate.source_content_hash
    ) {
      cached++;
      console.log(
        'EN CACHÉ:',
        analysis.event?.title || candidate.id
      );
      continue;
    }

    if (selected >= MAX_NEW_ANALYSES) {
      continue;
    }

    selected++;

    console.log(
      '\nPENDIENTE:',
      analysis.event?.title || candidate.id
    );

    if (!save) {
      continue;
    }

    try {
      const script = path.join(
        __dirname,
        'enrich-boletera-artists.js'
      );

      const { stdout } = await execFileAsync(
        process.execPath,
        [script, candidate.source_url, '--save'],
        {
          cwd: path.join(__dirname, '..'),
          timeout: 120000,
          maxBuffer: 2 * 1024 * 1024
        }
      );

      console.log(stdout);
    } catch (error) {
      errors++;
      console.error(
        'Error de enriquecimiento:',
        error.message
      );
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Candidatos consultados:', rows.length);
  console.log('Con caché vigente:', cached);
  console.log('Pasados o sin fecha válida:', past);
  console.log('Seleccionados para análisis:', selected);
  console.log('Errores:', errors);
  console.log('Eventos aprobados: 0');
  console.log('Eventos publicados: 0');

  if (!save) {
    console.log('Gemini utilizado: NO');
    console.log('Cambios realizados: 0');
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
