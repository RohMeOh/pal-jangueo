'use strict';

const {
  getMunicipalityRegion
} = require('./municipalityRegions');

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Read-only verification by default.
// Inside publication, take the same venue advisory lock used
// by the shared ticket venue registry, then lock the DB row.
async function requireVerifiedPrticketVenue(
  db, plan, { lock = false } = {}
) {
  if (
    !plan ||
    plan.sourceName !== 'PRticket' ||
    !plan.name ||
    !plan.sourceUrl
  ) {
    throw new Error('Plan PRticket inválido.');
  }

  if (lock) {
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['ticket-venue:' + normalize(plan.name)]
    );
  }

  const { rows } = await db.query(`
    SELECT id, name, municipality, region,
           location_verification_status
    FROM public.venues
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    ${lock ? 'FOR UPDATE' : ''}
  `, [plan.name]);

  if (rows.length !== 1) {
    throw new Error('Venue ausente o nombre ambiguo.');
  }

  const venue = rows[0];

  if (venue.location_verification_status !== 'verified') {
    throw new Error('Venue no verificado en Supabase.');
  }

  if (
    !venue.municipality ||
    !venue.region ||
    getMunicipalityRegion(venue.municipality) !== venue.region
  ) {
    throw new Error('Municipio o región sin certificación coherente.');
  }

  if (
    plan.municipality &&
    normalize(plan.municipality) !== normalize(venue.municipality)
  ) {
    throw new Error('Municipio oficial contradice el venue registrado.');
  }

  return {
    id: venue.id,
    created: false,
    verified: true
  };
}

module.exports = { requireVerifiedPrticketVenue };
