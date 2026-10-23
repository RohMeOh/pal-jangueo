// Pa'l Jangueo - Explicit human editorial review.
// Preview by default. --record requires interactive confirmation.
// Never approves or publishes an event.

const pool = require('../db');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');

const args = process.argv.slice(2);
const id = args[0];
const record = args[1] === '--record';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (
  !UUID.test(id || '') ||
  args.length > 2 ||
  (args.length === 2 && !record)
) {
  console.error(
    'Uso: node scripts/record-editorial-review.js UUID [--record]'
  );
  process.exit(1);
}

function verifyCurrentSource() {
  const verifier = path.join(
    __dirname,
    'review-boletera-source.js'
  );

  const result = spawnSync(
    process.execPath,
    [verifier, id],
    {
      encoding: 'utf8',
      timeout: 30000
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error || result.status !== 0) {
    throw new Error(
      'La verificación técnica no terminó correctamente.'
    );
  }
}

async function main() {
  try {
    console.log('\n=== VERIFICACIÓN PREVIA ===');

    // Fail closed if the live source cannot be verified.
    verifyCurrentSource();

    const { rows } = await pool.query(`
      SELECT *
      FROM public.event_candidates
      WHERE id = $1
    `, [id]);

    if (rows.length !== 1) {
      throw new Error('Candidato no encontrado.');
    }

    const candidate = rows[0];
    const analysis = candidate.analysis_result || {};
    const event = analysis.event || {};

    if (
      candidate.source_name !== 'Boletera' ||
      candidate.is_test !== false ||
      candidate.review_status !== 'pending_review' ||
      candidate.approved_event_id != null ||
      candidate.reviewed_at != null ||
      analysis.editorial_review
    ) {
      throw new Error('Candidato no apto para revisión.');
    }

    console.log('\n=== DECISIÓN EDITORIAL ===');
    console.log('Evento:', event.title);
    console.log('Local:', event.venue);
    console.log('Fecha UTC:', event.normalized?.start_at);
    console.log('Fuente:', candidate.source_url);
    console.log('Modo:', record ? 'REGISTRAR' : 'VISTA PREVIA');

    if (!record) {
      console.log('\nRevisión humana registrada: NO');
      console.log('Candidato aprobado: NO');
      console.log('Evento publicado: NO');
      console.log('Cambios realizados: 0');
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let confirmation;
    let reason;

    try {
      console.log(
        '\nAbre la fuente y comprueba personalmente ' +
        'título, fecha, local y estado del evento.'
      );

      confirmation = await rl.question(
        'Escribe REVISADO para confirmar tu revisión: '
      );

      if (confirmation.trim() !== 'REVISADO') {
        throw new Error('Revisión cancelada.');
      }

      reason = await rl.question(
        'Describe qué comprobaste (mínimo 20 caracteres): '
      );

      if (reason.trim().length < 20) {
        throw new Error(
          'La justificación editorial es demasiado corta.'
        );
      }
    } finally {
      rl.close();
    }

    const editorial = {
      method: 'manual_editorial_review',
      reason: reason.trim(),
      evidence_urls: [candidate.source_url],
      original_source_content_hash:
        candidate.source_content_hash,
      technical_verification:
        'review-boletera-source.js',
      recorded_at: new Date().toISOString()
    };

    const updated = await pool.query(`
      UPDATE public.event_candidates
      SET
        analysis_result = jsonb_set(
          analysis_result,
          '{editorial_review}',
          $2::jsonb,
          true
        ),
        reviewed_at = NOW()
      WHERE id = $1
        AND source_name = 'Boletera'
        AND is_test = FALSE
        AND review_status = 'pending_review'
        AND approved_event_id IS NULL
        AND reviewed_at IS NULL
        AND source_content_hash = $3
        AND analysis_result IS NOT DISTINCT FROM $4::jsonb
      RETURNING id
    `, [
      candidate.id,
      JSON.stringify(editorial),
      candidate.source_content_hash,
      JSON.stringify(candidate.analysis_result)
    ]);

    if (updated.rowCount !== 1) {
      throw new Error(
        'El candidato cambió. Debes repetir la revisión.'
      );
    }

    console.log('\nRevisión humana registrada: SÍ');
    console.log('Candidato aprobado: NO');
    console.log('Evento publicado: NO');

  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
