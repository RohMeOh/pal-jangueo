const { createHash } = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])])
    );
  }
  return value;
}

function ticketcenterCandidateSnapshot(row) {
  const evidence = {
    id: row.id,
    source_url: row.source_url,
    flyer_url: row.flyer_url ?? null,
    caption_text: row.caption_text,
    source_content_hash: row.source_content_hash,
    analysis_result: row.analysis_result
  };

  return createHash('sha256')
    .update(JSON.stringify(canonical(evidence)))
    .digest('hex');
}

module.exports = { ticketcenterCandidateSnapshot };
