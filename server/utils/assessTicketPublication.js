// Shared publication decision for ticketing sources. Pure: never writes to DB.
// Source adapters verify the official page, venue, and duplicates, then
// provide trustworthy statuses; source JSON cannot set them directly.

const { assessMusicEvidence } = require('./assessMusicEvidence');
const { assessMusicCatalogEligibility } = require('./assessMusicCatalogEligibility');

function assessTicketPublication({ event, description, verification, now } = {}) {
  const music = assessMusicEvidence(description);
  const verifiedMusic =
    music.has_musical_program_evidence === true &&
    music.non_music_event_detected !== true &&
    music.mixed_event_detected !== true;

  const musicStatus = music.non_music_event_detected
    ? 'non_music'
    : verifiedMusic ? 'verified_music' : 'needs_review';

  const policy = assessMusicCatalogEligibility({
    event,
    verification: {
      ...verification,
      music_status: musicStatus
    },
    now
  });

  return { music, policy };
}

module.exports = { assessTicketPublication };
