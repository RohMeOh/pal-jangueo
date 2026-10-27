'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  reuseVerifiedBoleteraVenue: reuse
} = require('../utils/reuseVerifiedBoleteraVenue');

const {
  normalizeBoleteraCandidate
} = require('../utils/normalizeBoleteraCandidate');

const raw = {
  event_type: 'MusicEvent',
  source_url: 'https://boletos.boletera.net/e/test-musical',
  name: 'Concierto de prueba',
  start_date: '2027-05-01T20:00:00-04:00',
  event_status: 'EventScheduled',
  venue: {
    name: 'La Respuesta',
    municipality: null,
    postal_code: '00911'
  }
};

const verified = {
  name: 'La Respuesta',
  municipality: 'San Juan',
  region: 'La Metro',
  address: 'Santurce, San Juan, PR 00911',
  location_verification_status: 'verified'
};

const database = rows => ({
  query: async () => ({ rows })
});

test('Reuses a single verified venue', async () => {
  const original = JSON.stringify(raw);
  const result = await reuse(raw, database([verified]));

  assert.equal(result.venue.municipality, 'San Juan');
  assert.equal(
    normalizeBoleteraCandidate(result).municipality,
    'San Juan'
  );

  assert.equal(JSON.stringify(raw), original);
});

test('Rejects unverified venues', async () => {
  const result = await reuse(raw, database([{
    ...verified,
    location_verification_status: 'unverified'
  }]));

  assert.equal(result.venue.municipality, null);
});

test('Rejects ambiguous venue names', async () => {
  const result = await reuse(raw, database([
    verified,
    { ...verified }
  ]));

  assert.equal(result.venue.municipality, null);
});

test('Rejects contradictory postal codes', async () => {
  const result = await reuse(raw, database([{
    ...verified,
    address: 'Otra dirección, 00617'
  }]));

  assert.equal(result.venue.municipality, null);
});

test('Does not override the official municipality', async () => {
  const source = {
    ...raw,
    venue: {
      ...raw.venue,
      municipality: 'Ponce'
    }
  };

  const result = await reuse(source, database([verified]));
  assert.equal(result.venue.municipality, 'Ponce');
});

test('Rejects untrusted event sources', async () => {
  const result = await reuse({
    ...raw,
    source_url: 'https://example.com/e/test-musical'
  }, database([verified]));

  assert.equal(result.venue.municipality, null);
});
