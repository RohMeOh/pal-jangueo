// Pa'l Jangueo - Shared Boletera staging eligibility.
// Evidence permits review staging, never publication.

const {
  assessMusicEvidence
} = require('./assessMusicEvidence');

function assessBoleteraMusicCandidate(rawEvent) {
  const assessment = assessMusicEvidence(
    rawEvent?.description_raw
  );

  const structuredMusicContext =
    rawEvent?.event_type === 'MusicEvent' &&
    assessment.classification ===
      'contexto_musical_pendiente_de_verificar' &&
    !assessment.signals.includes('Experiencia temática') &&
    !assessment.signals.includes('Documental o cine');

  const eligibleForReview =
    rawEvent?.event_type === 'MusicEvent' &&
    (
      assessment.has_musical_program_evidence ||
      structuredMusicContext
    );

  return {
    assessment,
    eligibleForReview
  };
}

module.exports = { assessBoleteraMusicCandidate };
