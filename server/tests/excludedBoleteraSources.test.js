const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isExcludedBoleteraSource
} = require('../utils/excludedBoleteraSources');

test('blocks the known Boletera test source', () => {
  assert.equal(
    isExcludedBoleteraSource(
      'https://boletos.boletera.net/e/mx-lab-evento-de-prueba'
    ),
    true
  );
});

test('allows legitimate Boletera events', () => {
  assert.equal(
    isExcludedBoleteraSource(
      'https://boletos.boletera.net/e/417-xmases'
    ),
    false
  );
});

test('does not block unrelated hosts', () => {
  assert.equal(
    isExcludedBoleteraSource(
      'https://example.com/e/mx-lab-evento-de-prueba'
    ),
    false
  );
});
