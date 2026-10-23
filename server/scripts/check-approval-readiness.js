// Pa'l Jangueo - Event approval readiness check
// Read-only: never approves or publishes events.

const pool = require('../db');

const {
  checkSceneApprovalEligibility
} = require('../utils/checkSceneApprovalEligibility');


const candidateId = process.argv[2];

async function main() {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(candidateId || '')) {
      throw new Error('Debes proporcionar un ID de candidato.');
    }

    const { rows } = await pool.query(`
      SELECT
        id,
        is_test,
        review_status,
        source_name,
        source_url,
        source_content_hash,
        caption_text,
        approved_event_id,
        analysis_result
      FROM public.event_candidates
      WHERE id = $1
    `, [candidateId]);

    if (rows.length === 0) {
      throw new Error('Candidato no encontrado.');
    }

    const candidate = rows[0];
    const event = candidate.analysis_result?.event || {};
    const normalized = event.normalized || {};
    const problems = [];

    if (candidate.is_test) {
      problems.push('Es un candidato de prueba.');
    }

    if (candidate.review_status !== 'pending_review') {
      problems.push('Estado no válido para aprobación.');
    }

    if (!event.title) {
      problems.push('Falta el título.');
    }

    if (event.is_music_event !== true) {
      problems.push('No está confirmado como evento musical.');
    }

    const sceneCheck = await checkSceneApprovalEligibility(
      pool,
      candidate
    );

    if (!sceneCheck.eligible) {
      problems.push(
        'Relevancia de la escena sin corroborar: ' +
        sceneCheck.status
      );
    }

    const start = new Date(normalized.start_at);

    if (
      !normalized.start_at ||
      Number.isNaN(start.getTime()) ||
      start <= new Date()
    ) {
      problems.push('Fecha ausente, inválida o pasada.');
    }

    if (
      !['EventScheduled', 'scheduled'].includes(
        event.event_status
      )
    ) {
      problems.push('Estado del evento no confirmado.');
    }

    const venueResult = event.venue
      ? await pool.query(`
          SELECT id, name, location_verification_status
          FROM public.venues
          WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
            AND LOWER(TRIM(COALESCE(municipality, ''))) =
                LOWER(TRIM(COALESCE($2, '')))
        `, [event.venue, event.municipality])
      : { rows: [] };

    if (venueResult.rows.length !== 1) {
      problems.push('Local no identificado de forma única.');
    } else if (
      venueResult.rows[0].location_verification_status !==
      'verified'
    ) {
      problems.push('La ubicación del local no está verificada.');
    }

    const sourceResult = await pool.query(`
      SELECT id
      FROM public.sources
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    `, [candidate.source_name || '']);

    if (sourceResult.rows.length !== 1) {
      problems.push('Fuente no registrada.');
    }

    console.log('=== PA’L JANGUEO ===');
    console.log('VERIFICACIÓN DE APROBACIÓN\n');
    console.log('Evento:', event.title || 'Sin título');
    console.log('ID:', candidate.id);
    console.log('Fuente:', candidate.source_name);
    console.log('Local:', event.venue || 'Sin local');

    console.log('\n=== RESULTADO ===');

    if (problems.length) {
      console.log('NO ESTÁ LISTO PARA APROBACIÓN\n');

      for (const problem of problems) {
        console.log('-', problem);
      }
    } else {
      console.log('Comprobaciones preliminares superadas.');
      console.log('Todavía requiere aprobación humana.');
    }

    console.log('\nPublicaciones realizadas: 0');
    console.log('Registros modificados: 0');

  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
