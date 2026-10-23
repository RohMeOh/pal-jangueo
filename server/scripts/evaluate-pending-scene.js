// Pa'l Jangueo - Evaluate scene relevance for pending candidates.
// Preview by default. --save stores assessment snapshots.
// Never approves or publishes events.

const pool = require('../db');
const { isDeepStrictEqual } = require('node:util');

const {
  evaluateCandidateSceneRelevance
} = require('../utils/evaluateCandidateSceneRelevance');

const args = process.argv.slice(2);

if (args.some(arg => arg !== '--save')) {
  console.error(
    'Uso: node scripts/evaluate-pending-scene.js [--save]'
  );
  process.exit(1);
}

const save = args.includes('--save');

async function main() {
  const { rows } = await pool.query(`
    SELECT
      id,
      source_name,
      source_url,
      source_content_hash,
      caption_text,
      analysis_result,
      review_status,
      approved_event_id,
      is_test
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND is_test = FALSE
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
    ORDER BY id
    LIMIT 100
  `);

  console.log('\n=== EVALUACIÓN AUTOMÁTICA DE LA ESCENA ===');
  console.log('Modo:', save ? 'GUARDAR' : 'VISTA PREVIA');

  let changed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const candidate of rows) {
    try {
      if (!candidate.source_content_hash) {
        throw new Error('Candidato sin hash de contenido.');
      }

      const result = await evaluateCandidateSceneRelevance(
        pool,
        candidate
      );

      const snapshot = {
        version: 1,
        source_content_hash: candidate.source_content_hash,
        status: result.status,
        pillars: result.pillars,
        matched_venue: result.matched_venue,
        matched_organization: result.matched_organization,
        evidence_references:
          result.evidence_references || null,
        musical_performance_detected:
          result.musical_performance_detected,
        scene_relevance_documented:
          result.scene_relevance_documented,
        local_music_confirmed: false,
        safe_to_publish: false
      };

      const previous =
        candidate.analysis_result?.scene_relevance_assessment;

      const previousWithoutDate = previous
        ? Object.fromEntries(
            Object.entries(previous).filter(
              ([key]) => key !== 'evaluated_at'
            )
          )
        : null;

      console.log('\nEvento:', result.title);
      console.log('Estado:', result.status);
      console.log('Pilares:', JSON.stringify(result.pillars));
      console.log(
        'Relevancia documentada:',
        result.scene_relevance_documented
      );

      if (isDeepStrictEqual(previousWithoutDate, snapshot)) {
        unchanged++;
        console.log('Resultado: SIN CAMBIOS');
        continue;
      }

      if (!save) {
        changed++;
        console.log('Resultado: LISTO PARA GUARDAR');
        continue;
      }

      const record = {
        ...snapshot,
        evaluated_at: new Date().toISOString()
      };

      const updated = await pool.query(`
        UPDATE public.event_candidates
        SET analysis_result = jsonb_set(
          COALESCE(analysis_result, '{}'::jsonb),
          '{scene_relevance_assessment}',
          $3::jsonb,
          true
        )
        WHERE id = $1
          AND source_content_hash = $2
          AND review_status = 'pending_review'
          AND approved_event_id IS NULL
          AND is_test = FALSE
          AND analysis_result IS NOT DISTINCT FROM $4::jsonb
        RETURNING id
      `, [
        candidate.id,
        candidate.source_content_hash,
        JSON.stringify(record),
        candidate.analysis_result === null
          ? null
          : JSON.stringify(candidate.analysis_result)
      ]);

      if (updated.rowCount !== 1) {
        throw new Error(
          'El candidato cambió durante la evaluación.'
        );
      }

      changed++;
      console.log('Resultado: EVALUACIÓN GUARDADA');

    } catch (error) {
      errors++;
      console.error(
        'Error en candidato',
        candidate.id,
        error.message
      );
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Candidatos examinados:', rows.length);
  console.log('Evaluaciones nuevas o actualizadas:', changed);
  console.log('Sin cambios:', unchanged);
  console.log('Errores:', errors);
  console.log('Gemini utilizado: NO');
  console.log('Eventos aprobados: 0');
  console.log('Eventos publicados: 0');

  if (!save) {
    console.log('Cambios realizados: 0');
  }

  if (errors) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
