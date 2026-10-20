// Pa'l Jangueo - Candidate storage and deduplication

const pool = require('../db');

const {
  buildCandidateFingerprint
} = require('./candidateFingerprint');

const {
  buildSourceContentHash
} = require('./sourceContentHash');

async function findPotentialDuplicates(analysis, isTest = true) {
  const fingerprint = buildCandidateFingerprint(
    analysis?.event,
    isTest
  );

  if (!fingerprint) {
    return { fingerprint: null, matches: [] };
  }

  const { rows } = await pool.query(`
    SELECT id, source_name, source_url, review_status
    FROM public.event_candidates
    WHERE candidate_fingerprint = $1
      AND is_test = $2
    ORDER BY created_at DESC
    LIMIT 20
  `, [fingerprint, isTest]);

  return { fingerprint, matches: rows };
}

async function saveEventCandidate({
  analysis,
  sourceName = null,
  sourceUrl = null,
  flyerUrl = null,
  captionText = null,
  imagePath = null,
  isTest = true
}) {
  if (
    !analysis ||
    analysis.status !== 'pending_review' ||
    analysis.validation?.safe_to_publish !== false
  ) {
    throw new Error('Análisis no válido para revisión.');
  }

  if (isTest !== true) {
    throw new Error('Candidatos reales todavía no habilitados.');
  }

  const duplicates = await findPotentialDuplicates(
    analysis,
    isTest
  );

  const contentHash = buildSourceContentHash({
    captionText,
    imagePath
  });

  const validSourceUrl =
    typeof sourceUrl === 'string' && sourceUrl.trim()
      ? sourceUrl.trim()
      : null;

  const deduplicationActive = Boolean(
    validSourceUrl &&
    duplicates.fingerprint &&
    contentHash
  );

  const { rows } = await pool.query(`
    INSERT INTO public.event_candidates (
      source_name,
      source_url,
      flyer_url,
      caption_text,
      analysis_result,
      review_status,
      is_test,
      candidate_fingerprint,
      source_content_hash
    )
    VALUES (
      $1, $2, $3, $4, $5::jsonb,
      'pending_review', TRUE, $6, $7
    )
    ON CONFLICT (
      is_test,
      source_url,
      candidate_fingerprint,
      source_content_hash
    )
    WHERE source_url IS NOT NULL
      AND candidate_fingerprint IS NOT NULL
      AND source_content_hash IS NOT NULL
    DO NOTHING
    RETURNING id, review_status, is_test,
              candidate_fingerprint,
              source_content_hash,
              created_at
  `, [
    sourceName,
    validSourceUrl,
    flyerUrl,
    captionText,
    JSON.stringify(analysis),
    duplicates.fingerprint,
    contentHash
  ]);

  let candidate = rows[0];
  let reusedExisting = false;

  // A matching source version was already stored.
  if (!candidate && deduplicationActive) {
    const existing = await pool.query(`
      SELECT id, review_status, is_test,
             candidate_fingerprint,
             source_content_hash, created_at
      FROM public.event_candidates
      WHERE is_test = TRUE
        AND source_url = $1
        AND candidate_fingerprint = $2
        AND source_content_hash = $3
      LIMIT 1
    `, [
      validSourceUrl,
      duplicates.fingerprint,
      contentHash
    ]);

    candidate = existing.rows[0];
    reusedExisting = Boolean(candidate);
  }

  if (!candidate) {
    throw new Error('No se pudo guardar o recuperar el candidato.');
  }

  return {
    ...candidate,
    reused_existing: reusedExisting,
    deduplication_active: deduplicationActive,
    possible_duplicates: duplicates.matches.filter(
      item => item.id !== candidate.id
    )
  };
}

module.exports = {
  saveEventCandidate,
  findPotentialDuplicates
};
