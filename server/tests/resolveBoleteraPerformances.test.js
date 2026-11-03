const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveBoleteraPerformances
} = require('../utils/resolveBoleteraPerformances');

function fixture() {
  const url = 'https://boletos.boletera.net/e/example';
  return {
    raw: {
      event_type: 'MusicEvent',
      name: 'Example',
      source_url: url,
      start_date: null,
      ticket_url: url + '/tickets',
      offers: [
        { name: 'Jueves | Mar 4, 8PM', price: 32, url: url + '/tickets' },
        { name: 'Viernes | Mar 5, 8PM', price: 32, url: url + '/tickets' }
      ]
    },
    item: {
      api_record: true,
      api_title: 'Example',
      event_url: url,
      api_dates: [
        '2027-03-05T00:00:00.000Z',
        '2027-03-06T00:00:00.000Z'
      ]
    }
  };
}

test('resolves both Puerto Rico performances without mutating evidence', () => {
  const { raw, item } = fixture();
  const before = JSON.stringify(raw);
  const result = resolveBoleteraPerformances(raw, item);
  assert.deepEqual(result.map(p => p.start_date), item.api_dates);
  assert.deepEqual(result.map(p => p.offers.length), [1, 1]);
  assert.equal(JSON.stringify(raw), before);
});

test('rejects contradictory weekday or time', () => {
  for (const label of ['Viernes | Mar 4, 8PM', 'Jueves | Mar 4, 9PM']) {
    const { raw, item } = fixture();
    raw.offers[0].name = label;
    assert.throws(() => resolveBoleteraPerformances(raw, item));
  }
});

test('rejects unmatched tickets and contradictory primary date', () => {
  const { raw, item } = fixture();
  raw.offers.push({ name: 'VIP sin fecha', url: raw.ticket_url });
  assert.throws(() => resolveBoleteraPerformances(raw, item));
  raw.offers.pop();
  raw.start_date = '2027-03-07T00:00:00.000Z';
  assert.throws(() => resolveBoleteraPerformances(raw, item));
});

test('rejects different identity, invalid API and non-music sources', () => {
  for (const change of [
    f => { f.item.api_title = 'Another event'; },
    f => { f.item.api_invalid_dates = true; },
    f => { f.raw.event_type = 'VisualArtsEvent'; }
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => resolveBoleteraPerformances(f.raw, f.item));
  }
});
