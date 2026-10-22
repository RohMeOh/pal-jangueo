const pool = require('../db');

const candidateId = process.argv[2];
const confirm = process.argv.includes('--confirm');

const evidence = {
  reason:
    'Evento en San Juan con participacion de MIMA y Buscabulla, artistas vinculados a la escena musical puertorriquena.',
  sources: [
    'https://boletos.boletera.net/e/%C3%ACf%C3%A9-feat-mima-calma-carmona-raka-buscabulla',
    'https://www.nalac.org/es/members/9078-mima/',
    'https://eltrackpr.com/entrevistas/perfiles/buscabulla-navega-el-desencuentro-y-la-turbulencia-en-el-amor/2789/'
  ]
};

async function main() {
  try {
    if (
      candidateId !==
      '313457f9-0f7a-4699-86a3-5ebf24d64834'
    ) {
      throw new Error('Esta revisión es exclusiva del evento de IFÉ.');
    }

    const { rows } = await pool.query(`
      SELECT id, is_test, review_status,
             source_url, analysis_result
      FROM public.event_candidates
      WHERE id = $1
    `, [candidateId]);

    const candidate = rows[0];

    if (
      !candidate ||
      candidate.is_test ||
      candidate.review_status !== 'pending_review'
    ) {
      throw new Error('Candidato no elegible para revisión.');
    }

    if (
      candidate.source_url !== evidence.sources[0] ||
      candidate.analysis_result?.event?.is_music_event !== true
    ) {
      throw new Error('La fuente o el tipo musical no coincide.');
    }

    console.log('=== REVISION EDITORIAL ===');
    console.log('Evento:', candidate.analysis_result.event.title);
    console.log('Justificación:', evidence.reason);
    console.log('Fuentes:', evidence.sources.length);

    if (!confirm) {
      console.log('\nVISTA PREVIA');
      console.log('Registros modificados: 0');
      return;
    }

    const review = {
      local_music_confirmed: true,
      reason: evidence.reason,
      evidence_urls: evidence.sources,
      reviewed_at: new Date().toISOString(),
      method: 'manual_editorial_review'
    };

    const updated = await pool.query(`
      UPDATE public.event_candidates
      SET
        analysis_result = jsonb_set(
          jsonb_set(
            analysis_result,
            '{event,local_music_confirmed}',
            'true'::jsonb,
            true
          ),
          '{editorial_review}',
          $2::jsonb,
          true
        ),
        review_notes = concat_ws(
          E'\n',
          NULLIF(review_notes, ''),
          $3::text
        ),
        reviewed_at = NOW()
      WHERE id = $1
        AND is_test = FALSE
        AND review_status = 'pending_review'
        AND analysis_result #>> '{event,local_music_confirmed}' = 'false'
      RETURNING id
    `, [
      candidateId,
      JSON.stringify(review),
      evidence.reason
    ]);

    if (updated.rowCount !== 1) {
      throw new Error('El candidato ya cambió o fue revisado.');
    }

    console.log('\nRelevancia musical confirmada.');
    console.log('Estado: pending_review');
    console.log('Eventos publicados: 0');

  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
