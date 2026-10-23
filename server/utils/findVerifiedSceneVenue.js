// Pa'l Jangueo - Find a verified independent-scene venue.
// Read-only. Does not approve or publish events.

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getHost(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'https:') return null;

    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function findVerifiedSceneVenue(pool, {
  name,
  municipality = null
}) {
  if (!name || !normalize(name)) return null;

  const { rows } = await pool.query(`
    SELECT
      v.id AS venue_id,
      v.name,
      v.municipality,
      se.id AS scene_entity_id
    FROM public.venues v
    JOIN public.scene_entities se
      ON se.venue_id = v.id
    WHERE se.entity_type = 'venue'
      AND se.verification_status = 'verified'
      AND se.verified_at IS NOT NULL
      AND v.location_verification_status = 'verified'
  `);

  const matches = rows.filter(venue =>
    normalize(venue.name) === normalize(name) &&
    (
      !municipality ||
      normalize(venue.municipality) ===
        normalize(municipality)
    )
  );

  // Never guess when the venue is absent or ambiguous.
  if (matches.length !== 1) return null;

  const venue = matches[0];

  const evidence = await pool.query(`
    SELECT
      source_url,
      source_kind,
      evidence_summary
    FROM public.scene_entity_evidence
    WHERE scene_entity_id = $1
      AND verification_status = 'corroborated'
      AND checked_at IS NOT NULL
  `, [venue.scene_entity_id]);

  const validSources = evidence.rows.filter(item =>
    getHost(item.source_url) !== null
  );

  const independentHosts = new Set(
    validSources.map(item => getHost(item.source_url))
  );

  // Require at least two independent source domains.
  if (independentHosts.size < 2) return null;

  return {
    venue_id: venue.venue_id,
    venue_name: venue.name,
    municipality: venue.municipality,
    scene_entity_id: venue.scene_entity_id,
    scene_membership_verified: true,
    evidence_sources: validSources.map(item => ({
      url: item.source_url,
      kind: item.source_kind
    }))
  };
}

module.exports = { findVerifiedSceneVenue };
