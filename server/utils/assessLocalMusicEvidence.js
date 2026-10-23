// Pa'l Jangueo - Shared local music evidence assessment
// Used by ticketing platforms, venues and future social adapters.
// Evidence is not the same as verification.

const {
  assessMusicEvidence
} = require('./assessMusicEvidence');

function assessLocalMusicEvidence({
  rawDescription = '',
  sourceUrl = null
} = {}) {
  const music = assessMusicEvidence(rawDescription);

  let evidenceStatus = 'insufficient_music_evidence';

  if (music.has_musical_program_evidence) {
    evidenceStatus = 'musical_performance_detected';
  } else if (
    music.classification ===
    'contexto_musical_pendiente_de_verificar'
  ) {
    evidenceStatus = 'musical_context_detected';
  }

  return {
    evidence_status: evidenceStatus,

    signals: music.signals,

    musical_performance_detected:
      music.has_musical_program_evidence,

    source_evidence: {
      url: sourceUrl,
      description_excerpt:
        music.description.slice(0, 1500)
    },

    // Filled later using corroborated artist,
    // venue or promoter information.
    verified_artist_evidence: [],
    verified_promoter_evidence: [],

    local_music_verification_status:
      'pending_cross_source_verification',

    local_music_confirmed: false,
    safe_to_publish: false,

    missing_verifications: [
      'Identify the performing artist or musical act',
      'Verify participation in the Puerto Rican music scene',
      'Corroborate the performance with a reliable source'
    ]
  };
}

module.exports = { assessLocalMusicEvidence };
