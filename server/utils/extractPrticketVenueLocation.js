const {
  getMunicipalityRegion
} = require('./municipalityRegions');

function extractPrticketVenueLocation(text) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  // PRticket: "Nombre del local - Municipio, Puerto Rico"
  const match = value.match(
    /^(.+)\s+-\s+([^,]+)(?:,\s*(.*))?$/
  );

  if (!match) {
    return {
      venue: null,
      municipality: null,
      region: null
    };
  }

  const venue = match[1].trim();

  const locations = [
    match[2]?.trim(),
    match[3]?.trim()
  ].filter(Boolean);

  // PRticket puede escribir:
  // "Santurce, San Juan" o "Santurce, Puerto Rico".
  let municipality = locations.find(
    location => getMunicipalityRegion(location)
  ) || null;

  if (!municipality) {
    const firstLocation = (locations[0] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    // Santurce es un barrio del municipio de San Juan.
    if (firstLocation === 'santurce') {
      municipality = 'San Juan';
    }
  }

  const region = municipality
    ? getMunicipalityRegion(municipality)
    : null;

  if (!venue || !region) {
    return {
      venue: null,
      municipality: null,
      region: null
    };
  }

  return { venue, municipality, region };
}

module.exports = { extractPrticketVenueLocation };
