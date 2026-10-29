const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeCatalog,
  compareDates,
  extractApiEvents
} = require('../utils/boleteraCatalog');

const base = 'https://boletos.boletera.net/e/';

test('combina portada y API sin duplicar eventos', () => {
  const html = `<a href="/e/existente">Evento</a>`;

  const api = [
    {
      status: 'published',
      title: 'Existente',
      external_url: base + 'existente',
      starts_at: '2027-03-04T00:00:00Z'
    },
    {
      status: 'published',
      title: 'Nuevo',
      external_url: base + 'nuevo',
      starts_at: '2027-03-05T00:00:00Z'
    }
  ];

  const result = mergeCatalog(html, api);

  assert.equal(result.homepageCount, 1);
  assert.equal(result.apiCount, 2);
  assert.equal(result.outsideHomepage, 1);
  assert.equal(result.events.length, 2);
});

test('conserva las dos funciones de Godspeed', () => {
  const records = extractApiEvents([{
    status: 'published',
    title: 'Godspeed',
    external_url: base + 'godspeed',
    starts_at: '2027-03-05T00:00:00Z',
    event_dates: [
      { starts_at: '2027-03-05T00:00:00Z' },
      { starts_at: '2027-03-06T00:00:00Z' }
    ]
  }]);

  assert.equal(records.length, 1);
  assert.equal(records[0].api_dates.length, 2);
  assert.equal(
    compareDates(null, records[0]),
    'multiple_dates'
  );
});

test('bloquea fechas contradictorias', () => {
  const item = {
    api_record: true,
    api_dates: ['2026-11-03T22:00:00.000Z']
  };

  assert.equal(
    compareDates('2026-10-06T18:00:00-04:00', item),
    'conflict'
  );
});

test('bloquea fecha oficial ausente', () => {
  assert.equal(compareDates(null, {
    api_record: true,
    api_dates: ['2027-03-05T00:00:00.000Z']
  }), 'missing_official_date');
});

test('rechaza URLs ajenas y eventos no publicados', () => {
  const records = extractApiEvents([
    {
      status: 'published',
      external_url: 'https://sitio-ajeno.com/e/evento'
    },
    {
      status: 'draft',
      external_url: base + 'borrador'
    }
  ]);

  assert.equal(records.length, 0);
});
