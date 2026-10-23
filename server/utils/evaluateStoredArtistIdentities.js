// Pa'l Jangueo - Audit stored cross-source artist identities.
// Read-only. Does not fetch websites or authorize publication.

const {
  assessCandidateLocalEvidence
} = require('./assessCandidateLocalEvidence');

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function httpsHost(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function recentCheck(value) {
  const time = Date.parse(value || '');
  const now = Date.now();

  return Number.isFinite(time) &&
    time <= now + 5 * 60 * 1000 &&
    now - time <= 30 * 24 * 60 * 60 * 1000;
}

async function evaluateStoredArtistIdentities(pool, candidate) {
  const preliminary = await assessCandidateLocalEvidence(
    pool,
    candidate
  );

  const analysis = candidate.analysis_result || {};
  const event = analysis.event || {};
  const records = analysis.artist_identity_verifications || {};

  const result = {
    title: preliminary.title,
    status: preliminary.status,
    documented_identity_matches: 0,
    artists: [],
    local_music_confirmed: false,
    safe_to_publish: false
  };

  if (preliminary.status === 'past_or_invalid_event') {
    return result;
  }

  for (const artist of preliminary.artists || []) {
    const record = artist.profile_id
      ? records[artist.profile_id]
      : null;

    let valid = false;

    if (
      record &&
      artist.event_quote_valid === true &&
      artist.local_evidence_requirements_met === true
    ) {
      const official = record.sources?.find(
        source => source.kind === 'artist_official'
      );

      const press = record.sources?.find(
        source => source.kind === 'press'
      );

      const officialHost = httpsHost(official?.url);
      const pressHost = httpsHost(press?.url);

      const datesMatch = (
        Number.isFinite(Date.parse(record.event_start_at)) &&
        Date.parse(record.event_start_at) ===
          Date.parse(event.normalized?.start_at)
      );

      const matches = (
        record.status === 'cross_source_event_match' &&
        record.artist_id === artist.profile_id &&
        normalized(record.artist_name) ===
          normalized(artist.name) &&
        record.source_content_hash ===
          candidate.source_content_hash &&
        normalized(record.event_title) ===
          normalized(event.title) &&
        normalized(record.venue) ===
          normalized(event.venue) &&
        datesMatch &&
        recentCheck(record.checked_at) &&
        record.checks?.official_event_match === true &&
        record.checks?.independent_press_event_match === true &&
        officialHost !== null &&
        pressHost !== null &&
        officialHost !== pressHost &&
        typeof official?.matched_excerpt === 'string' &&
        official.matched_excerpt.trim().length >= 15 &&
        typeof press?.matched_excerpt === 'string' &&
        press.matched_excerpt.trim().length >= 15
      );

      if (matches) {
        const { rows } = await pool.query(`
          SELECT source_url, source_kind, claim_type
          FROM public.artist_verification_evidence
          WHERE artist_id = $1
            AND verification_status = 'corroborated'
            AND source_url = ANY($2::text[])
        `, [
          artist.profile_id,
          [official.url, press.url]
        ]);

        const officialRegistered = rows.some(row =>
          row.source_url === official.url &&
          row.source_kind === 'artist_official' &&
          row.claim_type === 'based_in_puerto_rico'
        );

        const pressRegistered = rows.some(row =>
          row.source_url === press.url &&
          row.source_kind === 'press' &&
          row.claim_type === 'single_pr_performance'
        );

        valid = officialRegistered && pressRegistered;
      }
    }

    if (valid) {
      result.documented_identity_matches++;
    }

    result.artists.push({
      name: artist.name,
      profile_id: artist.profile_id || null,
      status: valid
        ? 'stored_cross_source_match_valid'
        : 'identity_verification_pending',
      stored_identity_match_valid: valid
    });
  }

  if (result.documented_identity_matches > 0) {
    result.status = 'stored_cross_source_matches_found';
  }

  return result;
}

module.exports = { evaluateStoredArtistIdentities };
