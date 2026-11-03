const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBoleteraCandidate
} = require('../utils/normalizeBoleteraCandidate');

function normalize(offers) {
  return normalizeBoleteraCandidate({
    event_type: 'MusicEvent',
    name: 'Concierto',
    start_date: '2027-11-01T00:00:00Z',
    event_status: 'EventScheduled',
    venue: { name: 'Local', municipality: 'San Juan' },
    offers
  }, new Date('2026-11-03T00:00:00Z'));
}

test('test tickets do not lower paid admission to zero', () => {
  const result = normalize([
    { name: 'TEST', price: 0, currency: 'USD' },
    { name: 'GA EARLY BIRD', price: 10, currency: 'USD' },
    { name: 'VIP STAGE ACCESS', price: 149.99, currency: 'USD' }
  ]);
  assert.equal(result.price_type, 'paid');
  assert.equal(result.price_min, 10);
  assert.equal(result.price_max, 149.99);
});

test('legitimate free admission remains free', () => {
  const result = normalize([
    { name: 'Entrada general gratuita', price: 0, currency: 'USD' }
  ]);
  assert.equal(result.price_type, 'free');
  assert.equal(result.price_min, 0);
});

test('only test offers leave price unknown', () => {
  const result = normalize([
    { name: 'PRUEBA interna', price: 0, currency: 'USD' },
    { name: 'TEST-01', price: 5, currency: 'USD' }
  ]);
  assert.equal(result.price_type, 'unknown');
  assert.equal(result.price_min, null);
});

test('a performer or event name containing test is not excluded', () => {
  const result = normalize([
    { name: 'Contest admission', price: 20, currency: 'USD' }
  ]);
  assert.equal(result.price_min, 20);
});
