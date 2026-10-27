'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveBoleteraVenueMunicipality: resolve
} = require('../utils/resolveBoleteraVenueMunicipality');

const {
  normalizeBoleteraCandidate
} = require('../utils/normalizeBoleteraCandidate');

const event = {
  event_type: 'MusicEvent',
  source_url: 'https://boletos.boletera.net/e/my-1st-rave-2',
  name: 'My 1st Rave',
  start_date: '2026-11-21T16:00:00.000Z',
  event_status: 'https://schema.org/EventScheduled',
  venue: {
    name: 'Centro de Convenciones de Barceloneta',
    street_address: 'Puerto Rico 681',
    postal_code: '00617',
    municipality: null
  }
};

test('Verified venue resolves Barceloneta', () => {
  assert.equal(resolve(event), 'Barceloneta');
  assert.equal(
    normalizeBoleteraCandidate(event).municipality,
    'Barceloneta'
  );
});

test('Different venue or address is not guessed', () => {
  assert.equal(resolve({
    ...event,
    venue: {...event.venue, name: 'Otro local'}
  }), null);

  assert.equal(resolve({
    ...event,
    venue: {...event.venue, postal_code: '00901'}
  }), null);

  assert.equal(resolve({
    ...event,
    venue: {...event.venue, street_address: 'Otra calle'}
  }), null);
});

test('Untrusted sources cannot use the fallback', () => {
  assert.equal(resolve({
    ...event,
    source_url: 'https://example.com/e/my-1st-rave-2'
  }), null);
});

test('Contradictory municipality is blocked', () => {
  assert.throws(() => resolve({
    ...event,
    venue: {...event.venue, municipality: 'Ponce'}
  }), /contradictorio/);
});

test('Existing explicit locations remain unchanged', () => {
  assert.equal(resolve({
    ...event,
    venue: {
      name: 'La Respuesta',
      municipality: 'San Juan'
    }
  }), 'San Juan');
});
