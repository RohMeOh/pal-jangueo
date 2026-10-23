// Pa'l Jangueo - Common candidate format for scene evaluation.
// Read-only. Source authenticity is separate from event relevance.

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeSceneCandidate(candidate) {
  const reject = status => ({
    status,
    assessment_allowed: false,
    safe_to_publish: false
  });

  if (
    !candidate ||
    candidate.is_test !== false ||
    candidate.review_status !== 'pending_review' ||
    candidate.approved_event_id != null ||
    !candidate.source_content_hash ||
    !validHttpsUrl(candidate.source_url)
  ) {
    return reject('candidate_not_eligible');
  }

  const analysis = candidate.analysis_result || {};
  const event = analysis.event || {};

  const start = new Date(event.normalized?.start_at || '');

  if (Number.isNaN(start.getTime()) || start <= new Date()) {
    return reject('past_or_invalid_event');
  }

  if (!event.title || !event.venue) {
    return reject('missing_event_fields');
  }

  const common = {
    title: event.title,
    venue: event.venue,
    municipality: event.municipality || null,
    start_at: event.normalized.start_at,
    source_name: candidate.source_name,
    source_url: candidate.source_url,
    safe_to_publish: false
  };

  if (candidate.source_name === 'Boletera') {
    const url = new URL(candidate.source_url);

    if (
      url.hostname !== 'boletos.boletera.net' ||
      !/^\/e\/[^/]+\/?$/.test(url.pathname)
    ) {
      return reject('invalid_boletera_source');
    }

    let raw;

    try {
      raw = JSON.parse(candidate.caption_text);
    } catch {
      return reject('invalid_boletera_data');
    }

    const status = String(event.event_status || '')
      .split('/')
      .pop()
      .toLowerCase();

    if (!['eventscheduled', 'scheduled'].includes(status)) {
      return reject('event_not_scheduled');
    }

    if (
      normalize(raw?.name) !== normalize(event.title) ||
      normalize(raw?.venue?.name) !== normalize(event.venue)
    ) {
      return reject('source_event_mismatch');
    }

    return {
      ...common,
      status: 'ready_for_scene_assessment',
      source_type: 'boletera',
      assessment_allowed: true,
      source_title: raw.name,
      source_venue: raw.venue.name,
      source_description: raw.description_raw || ''
    };
  }

  if (analysis.submission_method === 'manual') {
    if (
      analysis.source?.name !== candidate.source_name ||
      analysis.source?.url !== candidate.source_url ||
      analysis.source_text !== candidate.caption_text ||
      analysis.validation?.basic_checks_passed !== true ||
      event.is_music_event !== true
    ) {
      return reject('curated_source_data_mismatch');
    }

    // A submitted citation is not proof of authenticity.
    // Keep these candidates pending independent source review.
    return {
      ...common,
      status: 'awaiting_source_authenticity_review',
      source_type: 'curated',
      assessment_allowed: false,
      source_title: event.title,
      source_venue: event.venue,
      source_description: analysis.source_text || ''
    };
  }

  return reject('unsupported_candidate_source');
}

module.exports = { normalizeSceneCandidate };
