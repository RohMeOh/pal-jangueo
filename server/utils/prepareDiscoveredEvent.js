// Pa'l Jangueo - Shared preparation for discovered events
// No database writes. No automatic publishing.

const { normalizeEvent } = require('./normalizeEvent');
const { validateEvent } = require('./validateEvent');

function prepareDiscoveredEvent({
  sourceName,
  sourceUrl,
  event,
  sourceText = '',
  fieldEvidence = [],
  conflicts = [],
  locationCheck = null
}) {
  if (!sourceName || !sourceUrl) {
    throw new Error('Falta identificar la fuente del evento.');
  }

  const url = new URL(sourceUrl);

  if (url.protocol !== 'https:') {
    throw new Error('La fuente debe utilizar HTTPS.');
  }

  if (!event || typeof event !== 'object') {
    throw new Error('Faltan los datos del evento.');
  }

  const normalized = normalizeEvent(event);

  const preparedEvent = {
    title: event.title || null,
    is_music_event: event.is_music_event === true,
    local_music_confirmed: false,
    artists: Array.isArray(event.artists) ? event.artists : [],
    organizers: Array.isArray(event.organizers)
      ? event.organizers
      : [],
    venue: event.venue || null,
    municipality: event.municipality || null,
    neighborhood: event.neighborhood || null,
    date_text: event.date_text || null,
    time_text: event.time_text || null,
    price_text: event.price_text || null,
    normalized: normalized.normalized
  };

  const validation = validateEvent({
    event: preparedEvent,
    source_text: sourceText,
    field_evidence: fieldEvidence,
    conflicts,
    location_check: locationCheck
  });

  // Past events are not eligible for publication.
  const startAt = preparedEvent.normalized.start_at;

  if (startAt && new Date(startAt) <= new Date()) {
    validation.issues.push({
      code: 'past_event',
      severity: 'error',
      message: 'El evento ya pasó.'
    });

    validation.basic_checks_passed = false;
  }

  // This shared pipeline never authorizes publication.
  validation.review_required = true;
  validation.safe_to_publish = false;

  return {
    status: 'pending_review',
    review_required: true,
    source: {
      name: sourceName,
      url: url.href
    },
    event: preparedEvent,
    validation,
    field_evidence: fieldEvidence,
    conflicts,
    warnings: [],
    ready_for_date_validation:
      normalized.ready_for_date_validation
  };
}

module.exports = { prepareDiscoveredEvent };
