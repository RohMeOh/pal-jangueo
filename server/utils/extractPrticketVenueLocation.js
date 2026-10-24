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
  const municipality = match[2].trim();

  const region = getMunicipalityRegion(municipality);

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
