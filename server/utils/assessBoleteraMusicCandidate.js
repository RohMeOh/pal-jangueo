// Pa'l Jangueo - Shared Boletera staging eligibility.
// Evidence permits review staging, never publication.

const {
  assessMusicEvidence
} = require('./assessMusicEvidence');

function assessBoleteraMusicCandidate(rawEvent) {
  const assessment = assessMusicEvidence(
    rawEvent?.description_raw
  );

  // This type is trusted only when extracted from Boletera's live JSON-LD.
  // Its description may be incomplete or worded in unexpected ways.
  const eligibleForReview = rawEvent?.event_type === 'MusicEvent';

  return {
    assessment,
    eligibleForReview
  };
}

module.exports = { assessBoleteraMusicCandidate };
