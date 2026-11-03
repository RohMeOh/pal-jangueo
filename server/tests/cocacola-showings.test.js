const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCocaColaShowings: extract } =
  require('../utils/extractCocaColaShowings');

test('preserves both functions and ignores doors opening time', () => {
  assert.deepEqual(extract(`
    Date Nov 7 - 8, 2026 Doors Open 7:30 PM
    Showings <div>Nov 7, 2026 | Saturday 8:30 PM</div>
    <div>Nov 8, 2026 | Sunday 8:30 PM</div> Event Details
  `), [
    { date: 'Nov 7, 2026', time: '8:30 PM' },
    { date: 'Nov 8, 2026', time: '8:30 PM' }
  ]);
});

test('extracts a single showing', () => {
  assert.equal(extract('Showings Nov 14, 2026 | Saturday 8:30 PM').length, 1);
});

test('rejects a contradictory weekday', () => {
  assert.throws(() => extract('Showings Nov 7, 2026 | Friday 8:30 PM'));
});

test('does not invent a show time from doors opening', () => {
  assert.deepEqual(extract('Date Nov 7, 2026 Doors Open 7:30 PM'), []);
});

test('ignores showings in scripts', () => {
  assert.deepEqual(extract(
    '<script>Showings Nov 7, 2026 | Saturday 8:30 PM</script>'
  ), []);
});
