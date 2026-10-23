// Pa'l Jangueo - Independent music scene relevance.
// Artist residency and nationality are NOT requirements.
// This function never approves or publishes events.

const ALLOWED_LINKS = new Set([
  'independent_scene_venue',
  'independent_scene_promoter',
  'independent_scene_collective',
  'independent_scene_programming',
  'scene_collaboration'
]);

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validSceneLink(link) {
  return (
    link &&
    ALLOWED_LINKS.has(link.link_type) &&
    link.verification_status === 'corroborated' &&
    link.event_match_confirmed === true &&
    validHttpsUrl(link.source_url)
  );
}

function assessIndependentMusicScene({
  musicalPerformanceDetected = false,
  documentedSceneArtistAppearances = 0,
  verifiedSceneLinks = []
} = {}) {
  const sceneArtistMatches =
    Number.isInteger(documentedSceneArtistAppearances) &&
    documentedSceneArtistAppearances > 0
      ? documentedSceneArtistAppearances
      : 0;

  // Only backend-corroborated, event-specific links
  // should be supplied here. Never trust raw AI output.
  const sceneLinks = Array.isArray(verifiedSceneLinks)
    ? verifiedSceneLinks.filter(validSceneLink)
    : [];

  const sceneConnectionDocumented =
    sceneArtistMatches > 0 || sceneLinks.length > 0;

  let status = 'musical_performance_pending';

  if (musicalPerformanceDetected) {
    status = sceneConnectionDocumented
      ? 'scene_relevance_documented'
      : 'scene_relevance_pending';
  }

  return {
    status,
    musical_performance_detected:
      Boolean(musicalPerformanceDetected),

    performer_residency_required: false,
    foreign_artists_allowed: true,

    documented_scene_artist_appearances:
      sceneArtistMatches,

    corroborated_scene_connections:
      sceneLinks.length,

    scene_relevance_documented:
      Boolean(
        musicalPerformanceDetected &&
        sceneConnectionDocumented
      ),

    // Relevance alone is not publication authorization.
    event_validation_complete: false,
    safe_to_publish: false
  };
}

module.exports = { assessIndependentMusicScene };
