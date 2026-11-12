const test = require('node:test');
const assert = require('node:assert/strict');

const {
  comparePublishedPrticket
} = require('../utils/auditPublishedPrticket');

const card = {
  title: 'Primavera : Dianne de Jesús',
  source_url:
    'https://boletos.prticket.com/events/es/primavera'
};

const detail = {
  page_title:
    'Primavera : Dianne de Jesús - Teatro Tapia',
  description_evidence:
    'Concierto acústico de Dianne de Jesús.',
  date_evidence: 'viernes , 22 de enero de 2027',
  time_evidence: '7:00PM'
};

function event(start_at) {
  return {
    title: card.title,
    venue: 'Teatro Tapia',
    description: detail.description_evidence,
    start_at
  };
}

test('single performance matches despite comma spacing', () => {
  const issues = comparePublishedPrticket(
    [event('2027-01-22T23:00:00.000Z')],
    card,
    detail
  );

  assert.deepEqual(issues, []);
});

test('multiple performances are not treated as rescheduled', () => {
  const issues = comparePublishedPrticket(
    [
      event('2027-01-22T23:00:00.000Z'),
      event('2027-01-23T22:00:00.000Z')
    ],
    card,
    detail
  );

  assert.deepEqual(
    issues,
    ['FUNCIONES_MULTIPLES_REVISAR_FECHAS']
  );
});

test('real single-performance date changes are flagged', () => {
  const issues = comparePublishedPrticket(
    [event('2027-01-24T23:00:00.000Z')],
    card,
    detail
  );

  assert.ok(issues.includes('FECHA_CAMBIADA'));
});

test('missing descriptions are flagged, never replaced', () => {
  const issues = comparePublishedPrticket(
    [event('2027-01-22T23:00:00.000Z')],
    card,
    { ...detail, description_evidence: null }
  );

  assert.ok(issues.includes('DESCRIPCION_NO_EXTRAIBLE'));
});
