// Pa'l Jangueo - Shared music catalog eligibility policy.
//
// Pure function: no database operations or publication.
// Verification statuses must come from trusted validators,
// never directly from scraped or submitted JSON.

function validHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}

function scheduled(value) {
  const status = String(value || '')
    .split('/')
    .pop()
    .toLowerCase();

  return status === 'scheduled' ||
    status === 'eventscheduled';
}

function assessMusicCatalogEligibility({
  event = {},
  verification = {},
  now = new Date()
} = {}) {
  const blockers = [];

  if (verification.music_status === 'non_music') {
    return {
      status: 'excluded_non_music',
      eligible_for_auto_publication: false,
      scene_category: 'not_applicable',
      blockers: ['not_a_music_event']
    };
  }

  if (verification.source_status !== 'verified') {
    blockers.push('source_not_verified');
  }

  if (verification.music_status !== 'verified_music') {
    blockers.push('music_not_verified');
  }

  if (verification.venue_status !== 'verified') {
    blockers.push('venue_not_verified');
  }

  if (verification.duplicate_status !== 'clear') {
    blockers.push('duplicates_not_cleared');
  }

  if (verification.conflict_status !== 'clear') {
    blockers.push('conflicts_not_cleared');
  }

  if (!String(event.title || '').trim()) {
    blockers.push('missing_title');
  }

  if (!String(event.venue || '').trim()) {
    blockers.push('missing_venue');
  }

  const start = new Date(event.normalized?.start_at || '');

  if (
    Number.isNaN(start.getTime()) ||
    start <= new Date(now)
  ) {
    blockers.push('past_or_invalid_date');
  }

  if (!scheduled(event.event_status)) {
    blockers.push('event_not_scheduled');
  }

  if (!validHttps(event.source_url)) {
    blockers.push('invalid_source_url');
  }

  // The same price rules apply to every ticketing provider. An unknown
  // price is allowed; inconsistent or fabricated numeric prices are not.
  const normalized = event.normalized || {};
  const priceType = normalized.price_type ?? 'unknown';
  const min = normalized.price_min;
  const max = normalized.price_max;
  if (
    !['free', 'paid', 'unknown'].includes(priceType) ||
    [min, max].some(value =>
      value != null &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    ) ||
    (min != null && max != null && max < min) ||
    (priceType === 'free' &&
      ((min != null && min !== 0) || (max != null && max !== 0)))
  ) {
    blockers.push('invalid_price');
  }

  const eligible = blockers.length === 0;

  return {
    status: eligible
      ? 'eligible_for_auto_publication'
      : 'needs_review',

    eligible_for_auto_publication: eligible,

    scene_category:
      verification.independent_scene_status === 'verified'
        ? 'independent_scene'
        : 'general_music',

    blockers
  };
}

module.exports = {
  assessMusicCatalogEligibility
};
