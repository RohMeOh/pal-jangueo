const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractPrticketVenueLocation
} = require('../utils/extractPrticketVenueLocation');

test('PRticket extracts San Juan venue location', () => {
  const result = extractPrticketVenueLocation(
    'Hotel Caribe Hilton - San Juan , Puerto Rico'
  );

  assert.equal(result.venue, 'Hotel Caribe Hilton');
  assert.equal(result.municipality, 'San Juan');
  assert.equal(result.region, 'La Metro');
});

test('PRticket extracts Naranjito', () => {
  const result = extractPrticketVenueLocation(
    'Complejo Deportivo Gelito Ortega - Naranjito, Puerto Rico'
  );

  assert.equal(result.municipality, 'Naranjito');
  assert.equal(result.region, 'El Centro');
});

test('PRticket extracts Barranquitas', () => {
  const result = extractPrticketVenueLocation(
    'Coliseo Juan C. Berrios - Barranquitas, Barranquitas'
  );

  assert.equal(result.municipality, 'Barranquitas');
  assert.equal(result.region, 'El Centro');
});

test('Unknown locations are not invented', () => {
  const result = extractPrticketVenueLocation(
    'Local Desconocido - Ciudad Desconocida'
  );

  assert.equal(result.municipality, null);
  assert.equal(result.region, null);
});
