// Pa'l Jangueo - Find previously analyzed source content

const pool = require('../db');

const {
  buildSourceContentHash
} = require('./sourceContentHash');

async function findCachedSource({
  sourceUrl = null,
  captionText = null,
  imagePath = null,
  isTest = true
} = {}) {

  // We need a source URL to identify the publication.
  if (!sourceUrl || !String(sourceUrl).trim()) {
    return {
      checked: false,
      existing: null
    };
  }

  const contentHash = buildSourceContentHash({
    captionText,
    imagePath
  });

  // Without content we cannot reliably compare versions.
  if (!contentHash) {
    return {
      checked: false,
      existing: null
    };
  }

  const { rows } = await pool.query(`
    SELECT
      id,
      review_status,
      is_test,
      analysis_result,
      created_at
    FROM public.event_candidates
    WHERE source_url = $1
      AND source_content_hash = $2
      AND is_test = $3
    ORDER BY created_at DESC
    LIMIT 1
  `, [
    String(sourceUrl).trim(),
    contentHash,
    isTest
  ]);

  return {
    checked: true,
    content_hash: contentHash,
    existing: rows[0] || null
  };
}

module.exports = { findCachedSource };
