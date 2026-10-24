'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDetail } = require('../scripts/discover-prticket');
const { parsePuertoRicoDate, normalizePrticketEvent } = require('../utils/normalizePrticketEvent');

test('accepts official PRticket 12-hour formats without changing start times', () => {
  const expected = '2027-04-25T20:30:00.000Z';
  for (const time of ['4:30 PM', '4:30 pm', '4:30 p.m.', '4:30 p. m.', '4:30 P. M.']) {
    assert.equal(parsePuertoRicoDate('25 de abril de 2027', time), expected, time);
  }
});
test('keeps strict day/time validation', () => {
  assert.equal(parsePuertoRicoDate('25 de abril de 2027','4:99 p. m.'), null);
  assert.equal(parsePuertoRicoDate('31 de abril de 2027','4:30 p. m.'), null);
  assert.equal(parsePuertoRicoDate('lunes 25 de abril de 2027','4:30 p. m.'), null);
  assert.equal(parsePuertoRicoDate('25 de abril de 2027','13:30 p. m.'), null);
});
test('accepts official AM times', () => {
  assert.equal(parsePuertoRicoDate('25 de abril de 2027','10:15 a. m.'),'2027-04-25T14:15:00.000Z');
  assert.equal(parsePuertoRicoDate('25 de abril de 2027','12:15 a. m.'),'2027-04-25T04:15:00.000Z');
});
test('extracts date and time from a PRticket-style detail', () => {
  const html = `<html><head><meta property="og:title" content="Ricky Colón: Esencia - Moneró Café Teatro y Bar (CBA Caguas)"></head><body><h1>Ricky Colón: Esencia</h1><p>Concierto dedicado al bolero.</p><p>📅 25 de abril de 2027</p><p>🕟 4:30 p. m.</p></body></html>`;
  const detail = extractDetail(html);
  assert.equal(detail.date_evidence,'25 de abril de 2027');
  assert.equal(detail.time_evidence,'4:30 p. m.');
  const normalized = normalizePrticketEvent({title:'Ricky Colón: Esencia',source_url:'https://boletos.prticket.com/events/es/rickycolonesencia'},detail);
  assert.equal(normalized.start_at,'2027-04-25T20:30:00.000Z');
  assert.equal(normalized.status,'structured_data_ready');
});
test('unchanged plain AM/PM extraction and weekday dates', () => {
  const html = `<html><head><meta property="og:title" content="Boleros y Baladas - Abracadabra Counter Cafe"></head><body>🗓️ viernes, 6 de noviembre de 2026 ⏰ 8:00 PM</body></html>`;
  const detail = extractDetail(html);
  assert.equal(detail.time_evidence,'8:00 PM');
  assert.equal(parsePuertoRicoDate(detail.date_evidence,detail.time_evidence),'2026-11-07T00:00:00.000Z');
});
