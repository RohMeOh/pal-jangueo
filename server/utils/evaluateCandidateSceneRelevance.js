// Pa'l Jangueo - Shared scene relevance evaluator.
// Artist OR venue OR promoter/collective.
// Read-only. Never approves or publishes events.

const {
  assessLocalMusicEvidence
} = require('./assessLocalMusicEvidence');

const {
  evaluateStoredArtistIdentities
} = require('./evaluateStoredArtistIdentities');

const {
  findVerifiedSceneVenue
} = require('./findVerifiedSceneVenue');

const {
  findVerifiedSceneOrganizer
} = require('./findVerifiedSceneOrganizer');

const {
  assessIndependentMusicScene
} = require('./assessIndependentMusicScene');

const {
  normalizeSceneCandidate
} = require('./normalizeSceneCandidate');

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validBoleteraUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' &&
      url.hostname === 'boletos.boletera.net' &&
      /^\/e\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

async function evaluateCandidateSceneRelevance(pool, candidate) {
  const event = candidate.analysis_result?.event || {};

  const result = {
    title: event.title || 'Sin título',
    status: 'pending_verification',
    pillars: {
      artist: false,
      venue: false,
      collective: false,
      promoter: false
    },
    matched_venue: null,
    matched_organization: null,
    musical_performance_detected: false,
    scene_relevance_documented: false,
    local_music_confirmed: false,
    safe_to_publish: false
  };

  const normalizedCandidate =
    normalizeSceneCandidate(candidate);

  if (!normalizedCandidate.assessment_allowed) {
    result.status = normalizedCandidate.status;
    return result;
  }

  // Only independently validated source formats can
  // proceed to the existing scene evidence checks.
  if (normalizedCandidate.source_type !== 'boletera') {
    result.status = 'unsupported_scene_assessment_path';
    return result;
  }

  const start = new Date(event.normalized?.start_at || '');

  if (
    Number.isNaN(start.getTime()) ||
    start <= new Date()
  ) {
    result.status = 'past_or_invalid_event';
    return result;
  }

  const status = String(
    event.event_status || ''
  ).split('/').pop().toLowerCase();

  if (!['eventscheduled', 'scheduled'].includes(status)) {
    result.status = 'event_not_scheduled';
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

  if (
    !raw?.name ||
    !event.title ||
    normalize(raw.name) !== normalize(event.title)
  ) {
    result.status = 'event_title_mismatch';
    return result;
  }

  const music = assessLocalMusicEvidence({
    rawDescription: raw.description_raw,
    sourceUrl: candidate.source_url
  });

  const identities = await evaluateStoredArtistIdentities(
    pool,
    candidate
  );

  const venueNamesMatch = Boolean(
    raw.venue?.name &&
    event.venue &&
    normalize(raw.venue.name) === normalize(event.venue)
  );

  const verifiedVenue = venueNamesMatch
    ? await findVerifiedSceneVenue(pool, {
        name: raw.venue.name,
        municipality:
          raw.venue.municipality ||
          event.municipality ||
          null
      })
    : null;

  const verifiedOrganizer = await findVerifiedSceneOrganizer(
    pool,
    {
      sourceTitle: raw.name,
      eventTitle: event.title
    }
  );

  const links = [];

  if (verifiedVenue) {
    links.push({
      link_type: 'independent_scene_venue',
      verification_status: 'corroborated',
      event_match_confirmed: true,
      source_url: candidate.source_url
    });
  }

  if (verifiedOrganizer) {
    links.push({
      link_type: verifiedOrganizer.entity_type === 'collective'
        ? 'independent_scene_collective'
        : 'independent_scene_promoter',
      verification_status: 'corroborated',
      event_match_confirmed: true,
      source_url: candidate.source_url
    });
  }

  const artistMatches =
    identities.documented_identity_matches || 0;

  const assessment = assessIndependentMusicScene({
    musicalPerformanceDetected:
      music.musical_performance_detected === true,
    // These are event-specific
    // corroborated artist-scene appearances.
    documentedSceneArtistAppearances: artistMatches,
    verifiedSceneLinks: links
  });

  return {
    ...result,
    status: assessment.status,
    pillars: {
      artist: artistMatches > 0,
      venue: Boolean(verifiedVenue),
      collective:
        verifiedOrganizer?.entity_type === 'collective',
      promoter:
        verifiedOrganizer?.entity_type === 'promoter'
    },
    matched_venue: verifiedVenue?.venue_name || null,
    matched_organization: verifiedOrganizer?.name || null,
    evidence_references: {
      artist_profile_ids: (identities.artists || [])
        .filter(item => item.stored_identity_match_valid)
        .map(item => item.profile_id),
      scene_venue_id: verifiedVenue?.scene_entity_id || null,
      scene_organization_id:
        verifiedOrganizer?.scene_entity_id || null
    },
    musical_performance_detected:
      assessment.musical_performance_detected,
    scene_relevance_documented:
      assessment.scene_relevance_documented,
    local_music_confirmed: false,
    safe_to_publish: false
  };
}

module.exports = { evaluateCandidateSceneRelevance };
