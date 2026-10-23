// Pa'l Jangueo - Convert a Boletera event into review data

const {
  normalizeBoleteraCandidate
} = require('./normalizeBoleteraCandidate');

const {
  assessLocalMusicEvidence
} = require('./assessLocalMusicEvidence');

function buildBoleteraReviewAnalysis(rawEvent) {
  const candidate = normalizeBoleteraCandidate(rawEvent);

  const musicEvidence = assessLocalMusicEvidence({
    rawDescription: rawEvent.description_raw,
    sourceUrl: candidate.source_url
  });

  return {
    status: 'pending_review',
    review_required: true,

    music_evidence: musicEvidence,

    validation: {
      basic_checks_passed: Boolean(
        candidate.title &&
        candidate.start_at &&
        candidate.venue &&
        candidate.is_upcoming
      ),
      issues: candidate.review_reasons,
      review_required: true,
      safe_to_publish: false
    },

    event: {
      title: candidate.title,
      is_music_event: true,
      local_music_confirmed: false,
      venue: candidate.venue,
      venue_address: candidate.venue_address,
      municipality: candidate.municipality,
      artists: [],

      normalized: {
        start_at: candidate.start_at,
        price_type: candidate.price_type,
        price_min: candidate.price_min,
        price_max: candidate.price_max
      },

      ticket_provider: 'Boletera',
      ticket_url: candidate.ticket_url,
      event_status: candidate.event_status
    },

    warnings: candidate.review_reasons
  };
}

module.exports = { buildBoleteraReviewAnalysis };
