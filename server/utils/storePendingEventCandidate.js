// Shared storage for automatically discovered real candidates.
// Does not approve or publish events.

const { buildSourceContentHash } = require('./sourceContentHash');

const SOURCES = Object.freeze({
  PRticket: 'boletos.prticket.com'
});

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function validateCandidate(input) {
  const {
    sourceName, sourceUrl, flyerUrl,
    captionText, analysis, sourceContentHash
  } = input;

  const url = new URL(sourceUrl);
  const expectedHost = SOURCES[sourceName];

  if (
    !expectedHost ||
    url.protocol !== 'https:' ||
    url.hostname !== expectedHost ||
    url.username ||
    url.password ||
    !/^\/events\/es\/[a-z0-9_-]+\/?$/i.test(url.pathname)
  ) {
    throw new Error('Fuente no autorizada.');
  }

  if (
    analysis?.status !== 'pending_review' ||
    analysis?.source?.name !== sourceName ||
    analysis?.source?.url !== sourceUrl ||
    analysis?.validation?.safe_to_publish !== false ||
    analysis?.event?.is_music_event !== false ||
    analysis?.event?.event_status !== 'unverified' ||
    !analysis?.event?.title?.trim() ||
    !analysis?.event?.venue?.trim()
  ) {
    throw new Error('Candidato no cumple la política de almacenamiento.');
  }

  const start = new Date(
    analysis.event.normalized?.start_at || ''
  );

  if (
    Number.isNaN(start.getTime()) ||
    start <= new Date()
  ) {
    throw new Error('Fecha ausente, inválida o pasada.');
  }

  if (
    typeof captionText !== 'string' ||
    !captionText.trim() ||
    sourceContentHash !== buildSourceContentHash({ captionText })
  ) {
    throw new Error('Integridad del contenido incorrecta.');
  }

  if (flyerUrl) {
    const flyer = new URL(flyerUrl);

    if (
      flyer.protocol !== 'https:' ||
      flyer.hostname !== 'dgxrvn37x26wa.cloudfront.net' ||
      flyer.username ||
      flyer.password
    ) {
      throw new Error('Origen del flyer no autorizado.');
    }
  }
}

function existingCandidateDecision(rows, newHash) {
  if (!rows.length) return 'INSERT';

  if (rows.some(row =>
    row.source_content_hash === newHash
  )) {
    return 'YA_EXISTE';
  }

  const canReopen = rows.every(row =>
    ['rejected', 'needs_more_info'].includes(row.review_status) &&
    row.approved_event_id == null
  );

  return canReopen
    ? 'INSERT'
    : 'FUENTE_CAMBIO_REQUIERE_REVISION';
}

async function storePendingEventCandidate(input) {
  validateCandidate(input);

  const {
    pool, sourceName, sourceUrl, flyerUrl,
    captionText, analysis, sourceContentHash
  } = input;

  const client = await pool.connect();
  let transaction = false;

  try {
    await client.query('BEGIN');
    transaction = true;

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [sourceName + '|' + sourceUrl]
    );

    const existing = await client.query(`
      SELECT id, source_content_hash,
             review_status, approved_event_id
      FROM public.event_candidates
      WHERE source_name = $1
        AND source_url = $2
        AND is_test = FALSE
      ORDER BY created_at DESC
      FOR UPDATE
    `, [sourceName, sourceUrl]);

    const decision = existingCandidateDecision(
      existing.rows, sourceContentHash
    );

    if (decision !== 'INSERT') {
      await client.query('COMMIT');
      transaction = false;
      return decision;
    }

    // A changed source previously rejected or needing information
    // creates a NEW pending candidate, preserving review history.
    // No automatic approval or publication is performed.

    const event = analysis.event;
    const startAt = event.normalized.start_at;

    const others = await client.query(`
      SELECT id, source_name, analysis_result
      FROM public.event_candidates
      WHERE is_test = FALSE
        AND source_url IS DISTINCT FROM $1
        AND analysis_result #>> '{event,normalized,start_at}' = $2
      LIMIT 100
    `, [sourceUrl, startAt]);

    const duplicateCandidate = others.rows.some(row => {
      const other = row.analysis_result?.event || {};

      return (
        normalize(other.title) === normalize(event.title) &&
        normalize(other.venue) === normalize(event.venue)
      );
    });

    const published = await client.query(`
      SELECT e.id
      FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id
      WHERE e.start_at = $1
        AND LOWER(TRIM(e.title)) = LOWER(TRIM($2))
        AND LOWER(TRIM(v.name)) = LOWER(TRIM($3))
      LIMIT 1
    `, [startAt, event.title, event.venue]);

    if (duplicateCandidate || published.rows.length) {
      await client.query('COMMIT');
      transaction = false;
      return 'POSIBLE_DUPLICADO_OTRA_FUENTE';
    }

    const result = await client.query(`
      INSERT INTO public.event_candidates (
        source_name, source_url, flyer_url,
        caption_text, analysis_result,
        review_status, is_test, source_content_hash
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb,
        'pending_review', FALSE, $6
      )
      RETURNING id
    `, [
      sourceName,
      sourceUrl,
      flyerUrl,
      captionText,
      JSON.stringify(analysis),
      sourceContentHash
    ]);

    await client.query('COMMIT');
    transaction = false;

    return 'GUARDADO ' + result.rows[0].id;

  } catch (error) {
    if (transaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  validateCandidate,
  storePendingEventCandidate,
  existingCandidateDecision
};
