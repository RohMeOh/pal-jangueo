// Pa'l Jangueo - Review pending event candidates
// Read-only: does not approve, modify, or publish events.

const pool = require('../db');

const isTest = process.argv.includes('--tests');

async function main() {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        source_name,
        source_url,
        review_status,
        is_test,
        analysis_result,
        created_at
      FROM public.event_candidates
      WHERE is_test = $1
        AND review_status IN (
          'pending_review',
          'needs_more_info'
        )
      ORDER BY created_at DESC
      LIMIT 20
    `, [isTest]);

    console.log('=== PA’L JANGUEO ===');
    console.log('COLA DE REVISION');
    console.log('Modo:', isTest ? 'PRUEBAS' : 'REALES');
    console.log('Candidatos mostrados:', rows.length);

    if (rows.length === 0) {
      console.log('\nNo hay candidatos pendientes.');
      return;
    }

    for (const candidate of rows) {
      const analysis = candidate.analysis_result || {};
      const event = analysis.event || {};
      const normalized = event.normalized || {};

      console.log('\n----------------------------');
      console.log('ID:', candidate.id);
      console.log('Evento:', event.title || 'Sin título');
      console.log('Estado:', candidate.review_status);
      console.log('Fuente:', candidate.source_name || 'Desconocida');
      console.log('URL:', candidate.source_url || 'No disponible');
      console.log('Fecha UTC:', normalized.start_at || 'Sin fecha');
      console.log('Local:', event.venue || 'Sin local');
      console.log('Municipio:', event.municipality || 'Desconocido');

      console.log(
        'Precio:',
        normalized.price_type || 'unknown',
        '| Mínimo:',
        normalized.price_min ?? 'N/D',
        '| Máximo:',
        normalized.price_max ?? 'N/D'
      );

      console.log('Boletos:', event.ticket_url || 'Sin enlace');
      console.log('Es prueba:', candidate.is_test);
      console.log('Aprobado:', candidate.review_status === 'approved');
    }

    console.log('\nSolo lectura. No se modificaron registros.');

  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exitCode = 1;
});
