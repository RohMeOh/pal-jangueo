'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractPrticketPerformances
} = require('../utils/extractPrticketPerformances');

test('Primavera preserves both official performances', () => {
  const html = `
    <p>Se abre SEGUNDA función:</p>
    <p>\uD83D\uDDD3 viernes , 22 de enero de 2027</p>
    <p>\u23F0 &nbsp;7:00PM</p>
    <p>\uD83D\uDDD3\uFE0F sábado, 23 de enero de 2027</p>
    <p>\u23F0 &nbsp;6:00PM</p>
  `;

  const sessions = extractPrticketPerformances(html);

  assert.deepEqual(
    sessions.map(item => item.start_at),
    [
      '2027-01-22T23:00:00.000Z',
      '2027-01-23T22:00:00.000Z'
    ]
  );
});

test('A single performance stays single', () => {
  const sessions = extractPrticketPerformances(
    '<p>\uD83D\uDCC5 25 de abril de 2027</p><p>\u23F0 4:30 PM</p>'
  );

  assert.equal(sessions.length, 1);
});

test('Unlabelled dates do not create performances', () => {
  const sessions = extractPrticketPerformances(
    '<p>El 22 de enero de 2027 a las 7:00 PM.</p>'
  );

  assert.equal(sessions.length, 0);
});

test('Contradictory weekdays are rejected', () => {
  assert.throws(() => extractPrticketPerformances(
    '\uD83D\uDDD3 lunes, 22 de enero de 2027 \u23F0 7:00PM'
  ));
});

test('Impossible dates are rejected', () => {
  assert.throws(() => extractPrticketPerformances(
    '\uD83D\uDDD3 30 de febrero de 2027 \u23F0 7:00PM'
  ));
});

test('Dates inside scripts are ignored', () => {
  const sessions = extractPrticketPerformances(
    '<script>const value="\uD83D\uDDD3 22 de enero de 2027 \u23F0 7:00PM"</script>'
  );

  assert.equal(sessions.length, 0);
});
