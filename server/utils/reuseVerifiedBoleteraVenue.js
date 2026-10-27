'use strict';

const {
  getMunicipalityRegion
} = require('./municipalityRegions');

const {
  resolveBoleteraVenueMunicipality
} = require('./resolveBoleteraVenueMunicipality');

// Reuse a unique, previously verified venue.
// Never change the original source record or its content hash.
async function reuseVerifiedBoleteraVenue(raw, db) {
  if (raw?.event_type !== 'MusicEvent' || !raw.venue?.name) {
    return raw;
  }

  let url;
  try {
    url = new URL(raw.source_url);
  } catch {
    return raw;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'boletos.boletera.net' ||
    url.username || url.password ||
    url.search || url.hash ||
    !/^\/e\/[^/]+\/?$/.test(url.pathname)
  ) {
    return raw;
  }

  // Official location information always takes precedence.
  if (resolveBoleteraVenueMunicipality(raw)) {
    return raw;
  }

  const name = String(raw.venue.name).trim();
  if (name.length < 3 || name.length > 180) {
    return raw;
  }

  const { rows } = await db.query(`
    SELECT name, municipality, region, address,
           location_verification_status
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    LIMIT 2
  `, [name]);

  // Ambiguous and unverified venues must remain blocked.
  if (rows.length !== 1) return raw;

  const venue = rows[0];
  const region = getMunicipalityRegion(venue.municipality);

  if (
    venue.location_verification_status !== 'verified' ||
    !region ||
    venue.region !== region
  ) {
    return raw;
  }

  // Reject contradictory postal codes when both are available.
  const officialZip = String(raw.venue.postal_code || '').trim();
  const storedZip = String(venue.address || '')
    .match(/\b\d{5}(?:-\d{4})?\b/)?.[0];

  if (officialZip && storedZip && officialZip !== storedZip) {
    return raw;
  }

  return {
    ...raw,
    venue: {
      ...raw.venue,
      municipality: venue.municipality
    }
  };
}

module.exports = { reuseVerifiedBoleteraVenue };
