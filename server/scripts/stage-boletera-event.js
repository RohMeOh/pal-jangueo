// Pa'l Jangueo - Manual staging of Boletera events
// Preview by default. Never approves or publishes events.

const {
  extractEventJsonLd
} = require('../utils/extractEventJsonLd');

const {
  normalizeBoleteraCandidate
} = require('../utils/normalizeBoleteraCandidate');

const {
  buildBoleteraReviewAnalysis
} = require('../utils/buildBoleteraReviewAnalysis');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

async function main() {
  const input = process.argv[2];
  const stage = process.argv[3] === '--stage';

  if (!input || (process.argv[3] && !stage)) {
    throw new Error(
      'Uso: node scripts/stage-boletera-event.js URL [--stage]'
    );
  }

  const url = new URL(input);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'boletos.boletera.net' ||
    !/^\/e\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error('URL de evento de Boletera no válida.');
  }

  url.search = '';
  url.hash = '';

  const response = await fetch(url.href, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'text/html' }
  });

  if (
    !response.ok ||
    new URL(response.url).hostname !== 'boletos.boletera.net'
  ) {
    throw new Error('No se pudo verificar la página.');
  }

  const html = await response.text();

  const events = extractEventJsonLd(html, url.href);

  if (events.length !== 1) {
    throw new Error(
      'Se esperaba exactamente un MusicEvent en la página.'
    );
  }

  const event = events[0];
  const candidate = normalizeBoleteraCandidate(event);
  const analysis = buildBoleteraReviewAnalysis(event);

  console.log('\n=== PA’L JANGUEO ===');
  console.log('VISTA PREVIA DE CANDIDATO REAL\n');

  console.log('Evento:', candidate.title);
  console.log('Fecha UTC:', candidate.start_at);
  console.log('Local:', candidate.venue);
  console.log('Municipio:', candidate.municipality);
  console.log('Fuente:', candidate.source_name);
  console.log('URL:', candidate.source_url);
  console.log('Boletos:', candidate.ticket_url);
  console.log('Precio mínimo:', candidate.price_min);
  console.log('Precio máximo:', candidate.price_max);
  console.log('Evento futuro:', candidate.is_upcoming);
  console.log('Estado:', candidate.event_status);

  console.log('\nRevisión humana requerida: Sí');
  console.log('Música local confirmada: No');
  console.log('Publicación autorizada: No');

  if (!stage) {
    console.log('\nMODO VISTA PREVIA');
    console.log('Registros guardados: 0');
    return;
  }

  if (
    !candidate.title ||
    !candidate.venue ||
    !candidate.start_at ||
    !candidate.source_url ||
    !candidate.ticket_url ||
    !candidate.eligible_for_feed
  ) {
    throw new Error(
      'Faltan datos esenciales para guardar el candidato.'
    );
  }

  // Database access only happens in explicit staging mode.
  const pool = require('../db');
  const captionText = JSON.stringify(event);
  const contentHash = buildSourceContentHash({
    captionText
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize staging of the same source and content.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [url.href, contentHash]
    );

    const existing = await client.query(`
      SELECT id
      FROM public.event_candidates
      WHERE is_test = FALSE
        AND source_url = $1
        AND source_content_hash = $2
      LIMIT 1
    `, [url.href, contentHash]);

    let candidateId;

    if (existing.rows.length) {
      candidateId = existing.rows[0].id;
      console.log('\nCandidato existente reutilizado.');
    } else {
      const saved = await client.query(`
        INSERT INTO public.event_candidates (
          source_name,
          source_url,
          caption_text,
          analysis_result,
          review_status,
          is_test,
          source_content_hash
        )
        VALUES (
          'Boletera',
          $1,
          $2,
          $3::jsonb,
          'pending_review',
          FALSE,
          $4
        )
        RETURNING id
      `, [
        url.href,
        captionText,
        JSON.stringify(analysis),
        contentHash
      ]);

      candidateId = saved.rows[0].id;
      console.log('\nCandidato real guardado para revisión.');
    }

    await client.query('COMMIT');

    console.log('ID:', candidateId);
    console.log('Estado: pending_review');
    console.log('Publicado: NO');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
