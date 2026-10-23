const pool = require('../db');

const {
  evaluateCandidateSceneRelevance
} = require('../utils/evaluateCandidateSceneRelevance');

async function main() {
  const { rows } = await pool.query(`
    SELECT
      id,
      source_name,
      source_url,
      is_test,
      review_status,
      source_content_hash,
      caption_text,
      analysis_result
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND is_test = FALSE
      AND review_status = 'pending_review'
    ORDER BY id
  `);

  console.log('\n=== LOS TRES PILARES DE PA’L JANGUEO ===');

  for (const candidate of rows) {
    const result = await evaluateCandidateSceneRelevance(
      pool,
      candidate
    );

    console.log('\nEvento:', result.title);
    console.log('Estado:', result.status);
    console.log(
      'Presentación musical:',
      result.musical_performance_detected
    );
    console.log('Artista de la escena:', result.pillars.artist);
    console.log('Venue de la escena:', result.pillars.venue);
    console.log('Colectivo de la escena:', result.pillars.collective);
    console.log('Promotor de la escena:', result.pillars.promoter);

    console.log(
      'Venue identificado:',
      result.matched_venue || 'Ninguno'
    );

    console.log(
      'Organización identificada:',
      result.matched_organization || 'Ninguna'
    );

    console.log(
      'Relevancia documentada:',
      result.scene_relevance_documented
    );

    console.log(
      'Publicación autorizada:',
      result.safe_to_publish
    );
  }

  console.log('\nEventos examinados:', rows.length);
  console.log('Cambios realizados: 0');
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
