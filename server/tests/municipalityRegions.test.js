const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMunicipalityRegion,
  municipalityCount
} = require('../utils/municipalityRegions');

test('All 78 municipalities have a region', () => {
  assert.equal(municipalityCount, 78);
});

test('Each regional classification works', () => {
  const examples = {
    Arecibo: 'Norte',
    Bayamón: 'La Metro',
    Ponce: 'Sur',
    Fajardo: 'Este',
    Mayagüez: 'El West',
    Utuado: 'El Centro'
  };

  for (const [municipality, region] of Object.entries(examples)) {
    assert.equal(getMunicipalityRegion(municipality), region);
  }
});

test('Unknown municipalities do not receive invented regions', () => {
  assert.equal(getMunicipalityRegion(null), null);
  assert.equal(getMunicipalityRegion('Desconocido'), null);
});
