// Pa'l Jangueo - Prepare manually documented events.
// Read-only. Never saves, approves or publishes events.

const {
  prepareDiscoveredEvent
} = require('./prepareDiscoveredEvent');

function optionalHttpsUrl(value, field) {
  if (value == null || value === '') return null;

  const url = new URL(value);

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password
  ) {
    throw new Error(`${field} debe ser una URL HTTPS válida.`);
  }

  return url.href;
}

function prepareCuratedEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Se necesita un objeto con los datos del evento.');
  }

  const sourceName = String(input.source_name || '').trim();
  const sourceUrl = optionalHttpsUrl(
    input.source_url,
    'source_url'
  );

  const sourceText = String(input.source_text || '').trim();

  if (!sourceName || !sourceUrl || !sourceText) {
    throw new Error(
      'La fuente necesita nombre, URL y texto de evidencia.'
    );
  }

  if (!input.event || typeof input.event !== 'object') {
    throw new Error('Faltan los datos del evento.');
  }

  const fieldEvidence = Array.isArray(input.field_evidence)
    ? input.field_evidence
    : [];

  const conflicts = Array.isArray(input.conflicts)
    ? input.conflicts
    : [];

  const prepared = prepareDiscoveredEvent({
    sourceName,
    sourceUrl,
    event: input.event,
    sourceText,
    fieldEvidence,
    conflicts
  });

  const warnings = [...prepared.warnings];

  if (fieldEvidence.length === 0) {
    warnings.push(
      'No hay evidencias individuales para los campos.'
    );
  }

  return {
    ...prepared,
    submission_method: 'manual',
    source_text: sourceText,
    ticket_url: optionalHttpsUrl(
      input.ticket_url,
      'ticket_url'
    ),
    flyer_url: optionalHttpsUrl(
      input.flyer_url,
      'flyer_url'
    ),
    warnings,
    review_required: true,
    safe_to_publish: false
  };
}

module.exports = { prepareCuratedEvent };
