// Pa'l Jangueo - Verified venue enrichment

const venues = require('../data/verifiedVenues.json');

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isMissing(value) {
  return value == null || String(value).trim() === '';
}

function buildMapUrl(venue) {
  const query = `${venue.name}, ${venue.address}`;

  return 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(query);
}

function enrichVenueLocation(event) {
  const enriched = { ...event };

  const name = normalizeLabel(event.venue);

  const venue = venues.find(item =>
    [item.name, ...(item.aliases || [])].some(
      alias => normalizeLabel(alias) === name
    )
  );

  if (!venue) {
    return {
      event: enriched,
      location_check: {
        status: 'venue_not_found',
        matched_venue: null,
        filled_fields: [],
        conflicts: []
      }
    };
  }

  const fields = {
    region: venue.region,
    municipality: venue.municipality,
    neighborhood: venue.neighborhood,
    venue_address: venue.address
  };

  const conflicts = [];

  // Check contradictions before changing any field.
  for (const [field, value] of Object.entries(fields)) {
    if (
      !isMissing(enriched[field]) &&
      normalizeLabel(enriched[field]) !== normalizeLabel(value)
    ) {
      conflicts.push({
        field,
        extracted_value: enriched[field],
        verified_value: value
      });
    }
  }

  const location_check = {
    status: conflicts.length ? 'conflict' : 'matched',
    matched_venue: venue.name,
    source_url: venue.source_url,
    verified_on: venue.verified_on,
    filled_fields: [],
    conflicts
  };

  // Never overwrite contradictory information.
  if (conflicts.length) {
    return { event: enriched, location_check };
  }

  // Complete only fields that are missing.
  for (const [field, value] of Object.entries(fields)) {
    if (isMissing(enriched[field])) {
      enriched[field] = value;
      location_check.filled_fields.push(field);
    }
  }

  // Map links always come from our verified venue data.
  enriched.venue_map_url = buildMapUrl(venue);

  return {
    event: enriched,
    location_check
  };
}

module.exports = { enrichVenueLocation };
