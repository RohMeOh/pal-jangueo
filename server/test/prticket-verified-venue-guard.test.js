'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requireVerifiedPrticketVenue
} = require('../utils/requireVerifiedPrticketVenue');

const plan = {
  sourceName: 'PRticket',
  sourceUrl: 'https://boletos.prticket.com/events/es/concierto',
  name: 'La Respuesta',
  municipality: 'San Juan'
};

const verified = {
  id: 'venue-1',
  name: 'La Respuesta',
  municipality: 'San Juan',
  region: 'La Metro',
  location_verification_status: 'verified'
};

function database(rows, queries = []) {
  return {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [] };
      }
      return { rows };
    }
  };
}

test('Accepts one certified PRticket venue', async () => {
  const result = await requireVerifiedPrticketVenue(
    database([verified]), plan
  );
  assert.equal(result.id, verified.id);
  assert.equal(result.verified, true);
});

test('Reuses certified venue when listing omits municipality', async () => {
  const result = await requireVerifiedPrticketVenue(
    database([verified]), { ...plan, municipality: null }
  );
  assert.equal(result.verified, true);
});

test('Rejects unverified venue', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(
      database([{
        ...verified,
        location_verification_status: 'unverified'
      }]), plan
    ),
    /no verificado/
  );
});

test('Rejects missing municipality', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(
      database([{ ...verified, municipality: null }]), plan
    ),
    /Municipio o región/
  );
});

test('Rejects contradictory municipality', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(
      database([verified]),
      { ...plan, municipality: 'Ponce' }
    ),
    /contradice/
  );
});

test('Rejects inconsistent region', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(
      database([{ ...verified, region: 'Sur' }]), plan
    ),
    /Municipio o región/
  );
});

test('Rejects ambiguous venue names', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(
      database([verified, verified]), plan
    ),
    /ambiguo/
  );
});

test('Rejects absent venue', async () => {
  await assert.rejects(
    requireVerifiedPrticketVenue(database([]), plan),
    /ausente/
  );
});

test('Publication locks the venue for transactional recheck', async () => {
  const queries = [];
  const result = await requireVerifiedPrticketVenue(
    database([verified], queries),
    plan,
    { lock: true }
  );

  assert.equal(result.verified, true);
  assert.match(queries[0], /pg_advisory_xact_lock/);
  assert.match(queries[1], /FOR UPDATE/);
});
