// Pa'l Jangueo - Read-only local artist evidence checker.
// Does not verify web pages live or authorize event publication.

function hostname(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'https:') return null;

    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function checkLocalArtistEvidence(pool, name) {
  const matching = await pool.query(`
    SELECT id, name, website_url
    FROM public.artists
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    LIMIT 3
  `, [name]);

  const base = {
    extracted_name: name,
    identity_match_method: 'exact_name_only',
    evidence_requirements_met: false,
    event_identity_confirmed: false,
    local_music_confirmed: false,
    safe_to_publish: false,
    sources: []
  };

  if (matching.rows.length === 0) {
    return {
      ...base,
      status: 'artist_profile_missing'
    };
  }

  if (matching.rows.length !== 1) {
    return {
      ...base,
      status: 'ambiguous_artist_identity'
    };
  }

  const artist = matching.rows[0];
  const officialHost = hostname(artist.website_url);

  const { rows: evidence } = await pool.query(`
    SELECT
      source_url,
      source_kind,
      claim_type,
      evidence_excerpt
    FROM public.artist_verification_evidence
    WHERE artist_id = $1
      AND verification_status = 'corroborated'
    ORDER BY source_kind, source_url
  `, [artist.id]);

  const official = evidence.find(item =>
    item.source_kind === 'artist_official' &&
    [
      'based_in_puerto_rico',
      'active_in_local_scene'
    ].includes(item.claim_type) &&
    officialHost !== null &&
    hostname(item.source_url) === officialHost &&
    item.evidence_excerpt?.trim()
  );

  const independent = evidence.find(item =>
    item.source_kind === 'press' &&
    item.claim_type === 'active_in_local_scene' &&
    hostname(item.source_url) !== null &&
    hostname(item.source_url) !== officialHost &&
    item.evidence_excerpt?.trim()
  );

  const passed = Boolean(official && independent);

  return {
    ...base,
    artist_id: artist.id,
    registered_name: artist.name,
    evidence_requirements_met: passed,
    status: passed
      ? 'local_evidence_requirements_met'
      : 'insufficient_local_evidence',
    sources: [official, independent]
      .filter(Boolean)
      .map(item => ({
        url: item.source_url,
        claim: item.claim_type
      }))
  };
}

module.exports = { checkLocalArtistEvidence };
