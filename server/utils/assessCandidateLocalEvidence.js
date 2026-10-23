// Pa'l Jangueo - Candidate-level local music evidence.
// Read-only. Never approves or publishes events.

const {
  checkLocalArtistEvidence
} = require('./checkLocalArtistEvidence');

const {
  assessMusicEvidence
} = require('./assessMusicEvidence');

function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

async function assessCandidateLocalEvidence(pool, candidate) {
  const analysis = candidate.analysis_result || {};
  const event = analysis.event || {};
  const extraction = analysis.artist_extraction;

  const result = {
    title: event.title || 'Sin título',
    status: 'pending_verification',
    artists: [],
    artists_with_local_evidence: 0,
    event_identity_confirmed: false,
    local_music_confirmed: false,
    safe_to_publish: false
  };

  const start = new Date(event.normalized?.start_at || '');

  if (Number.isNaN(start.getTime()) || start <= new Date()) {
    result.status = 'past_or_invalid_event';
    return result;
  }

  if (
    !extraction ||
    extraction.source_content_hash !== candidate.source_content_hash
  ) {
    result.status = 'artist_extraction_missing_or_outdated';
    return result;
  }

  let raw;

  try {
    raw = typeof candidate.caption_text === 'string'
      ? JSON.parse(candidate.caption_text)
      : candidate.caption_text;
  } catch {
    result.status = 'invalid_source_data';
    return result;
  }

  const sourceText = [
    `TÍTULO ORIGINAL: ${raw?.name || ''}`,
    `DESCRIPCIÓN ORIGINAL: ${
      assessMusicEvidence(raw?.description_raw).description
    }`
  ].join('\n');

  for (const item of (extraction.artists || []).slice(0, 30)) {
    if (typeof item.name !== 'string' || !item.name.trim()) {
      continue;
    }

    const quote = item.evidence?.quote;
    const quoteValid = (
      item.evidence?.source === 'text' &&
      typeof quote === 'string' &&
      normalize(quote).length > 0 &&
      normalize(sourceText).includes(normalize(quote))
    );

    if (!quoteValid) {
      result.artists.push({
        name: item.name,
        status: 'invalid_event_quote',
        identity_confirmed: false
      });
      continue;
    }

    const evidence = await checkLocalArtistEvidence(
      pool,
      item.name
    );

    if (evidence.evidence_requirements_met) {
      result.artists_with_local_evidence++;
    }

    result.artists.push({
      name: item.name,
      role: item.role,
      profile_id: evidence.artist_id || null,
      evidence_status: evidence.status,
      local_evidence_requirements_met:
        evidence.evidence_requirements_met,
      identity_match_method: evidence.identity_match_method,
      event_quote_valid: true,
      identity_confirmed: false
    });
  }

  result.status = result.artists_with_local_evidence > 0
    ? 'local_evidence_found_identity_pending'
    : 'local_evidence_pending';

  return result;
}

module.exports = { assessCandidateLocalEvidence };
