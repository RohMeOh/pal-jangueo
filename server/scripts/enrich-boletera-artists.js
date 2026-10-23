// Pa'l Jangueo - Add artist evidence to existing candidates.
// Read-only by default. --save stores extracted evidence.
// Never approves or publishes events.

const pool = require('../db');

const {
  extractArtistsFromAnnouncement
} = require('../utils/extractArtistsFromAnnouncement');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const args = process.argv.slice(2);
const sourceUrl = args[0];
const save = args.includes('--save');

async function main() {
  if (
    !sourceUrl ||
    args.some(arg => arg !== sourceUrl && arg !== '--save')
  ) {
    throw new Error(
      'Uso: node scripts/enrich-boletera-artists.js URL [--save]'
    );
  }

  const url = new URL(sourceUrl);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'boletos.boletera.net' ||
    !/^\/e\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error('URL de Boletera no permitida.');
  }

  const { rows } = await pool.query(`
    SELECT id, caption_text, analysis_result,
           source_content_hash, review_status,
           approved_event_id
    FROM public.event_candidates
    WHERE source_name = 'Boletera'
      AND source_url = $1
      AND is_test = FALSE
  `, [url.href]);

  if (rows.length !== 1) {
    throw new Error(
      'Se esperaba exactamente un candidato real para esta URL.'
    );
  }

  const candidate = rows[0];
  const analysis = candidate.analysis_result || {};

  console.log('\n=== ENRIQUECIMIENTO DE ARTISTAS ===');
  console.log('Candidato:', candidate.id);
  console.log(
    'Evento:',
    analysis.event?.title || 'Sin título'
  );

  const cached = analysis.artist_extraction;

  if (
    cached?.source_content_hash ===
    candidate.source_content_hash
  ) {
    console.log('Resultado: ARTISTAS EN CACHÉ');

    for (const artist of cached.artists || []) {
      console.log('-', artist.name, `(${artist.role})`);
    }

    console.log('Gemini utilizado: NO');
    console.log('Cambios realizados: 0');
    return;
  }

  if (!save) {
    console.log('Resultado: PENDIENTE DE EXTRACCIÓN');
    console.log('Gemini utilizado: NO');
    console.log('Cambios realizados: 0');
    console.log('Para guardar, ejecuta con --save.');
    return;
  }

  if (
    candidate.review_status !== 'pending_review' ||
    candidate.approved_event_id !== null
  ) {
    throw new Error(
      'El candidato ya fue revisado o aprobado.'
    );
  }

  const date = new Date(
    analysis.event?.normalized?.start_at || ''
  );

  if (
    Number.isNaN(date.getTime()) ||
    date <= new Date()
  ) {
    throw new Error(
      'No se analizarán automáticamente eventos pasados.'
    );
  }

  const raw = JSON.parse(candidate.caption_text);

  const description = assessMusicEvidence(
    raw.description_raw
  ).description;

  const sourceText = [
    `TÍTULO ORIGINAL: ${raw.name}`,
    `DESCRIPCIÓN ORIGINAL: ${description}`
  ].join('\n');

  console.log('Analizando artistas con Gemini...');

  const extraction = await extractArtistsFromAnnouncement({
    sourceText,
    sourceName: 'Boletera',
    sourceUrl: url.href
  });

  if (extraction.artists.length === 0) {
    console.log('No se encontraron artistas con citas válidas.');
    console.log(
      'Se guardará el resultado vacío para evitar repetir Gemini.'
    );
  }

  const savedEvidence = {
    ...extraction,
    source_content_hash: candidate.source_content_hash,
    extracted_at: new Date().toISOString(),
    verification_method: 'ai_text_extraction',
    review_required: true,
    local_music_confirmed: false,
    safe_to_publish: false
  };

  const result = await pool.query(`
    UPDATE public.event_candidates
    SET analysis_result = jsonb_set(
      jsonb_set(
        analysis_result,
        '{event,artists}',
        $2::jsonb,
        true
      ),
      '{artist_extraction}',
      $3::jsonb,
      true
    )
    WHERE id = $1
      AND source_content_hash = $4
      AND review_status = 'pending_review'
      AND approved_event_id IS NULL
      AND is_test = FALSE
      AND (
        analysis_result->'artist_extraction'
          ->>'source_content_hash'
      ) IS DISTINCT FROM $4
    RETURNING id
  `, [
    candidate.id,
    JSON.stringify(extraction.artists),
    JSON.stringify(savedEvidence),
    candidate.source_content_hash
  ]);

  if (result.rowCount !== 1) {
    throw new Error(
      'El candidato cambió durante el análisis. No se guardó.'
    );
  }

  console.log('\nARTISTAS GUARDADOS:');

  for (const artist of extraction.artists) {
    console.log('-', artist.name, `(${artist.role})`);
    console.log('  Evidencia:', artist.evidence.quote);
  }

  console.log('\nMúsica local confirmada: NO');
  console.log('Estado: pending_review');
  console.log('Eventos aprobados: 0');
  console.log('Eventos publicados: 0');
}

main()
  .catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
