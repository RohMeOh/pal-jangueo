const test = require('node:test');
const assert = require('node:assert/strict');

const {
  planTicketVenue
} = require('../utils/ticketVenueRegistry');

test('Boletera recognizes a Puerto Rico municipality', () => {
  const plan = planTicketVenue({
    sourceName: 'Boletera',
    sourceUrl: 'https://boletos.boletera.net/e/concierto',
    venueName: 'Local Nuevo',
    municipality: 'Bayamón'
  });

  assert.equal(plan.municipality, 'Bayamón');
});

test('Garrochales maps to Arecibo', () => {
  const plan = planTicketVenue({
    sourceName: 'Boletera',
    sourceUrl: 'https://boletos.boletera.net/e/concierto',
    venueName: 'Parroquia de Prueba',
    municipality: 'Garrochales'
  });

  assert.equal(plan.municipality, 'Arecibo');
  assert.equal(plan.neighborhood, 'Garrochales');
});

test('PRticket can preserve an unknown municipality', () => {
  const plan = planTicketVenue({
    sourceName: 'PRticket',
    sourceUrl: 'https://boletos.prticket.com/events/es/concierto',
    venueName: 'Local Nuevo'
  });

  assert.equal(plan.municipality, null);
});

test('Rejects unauthorized ticket sources', () => {
  assert.throws(() => planTicketVenue({
    sourceName: 'Boletera',
    sourceUrl: 'https://example.com/e/concierto',
    venueName: 'Local Nuevo',
    municipality: 'San Juan'
  }));
});

test('Rejects unknown geographical locations', () => {
  assert.throws(() => planTicketVenue({
    sourceName: 'Boletera',
    sourceUrl: 'https://boletos.boletera.net/e/concierto',
    venueName: 'Local Nuevo',
    municipality: 'Ciudad Desconocida'
  }));
});
