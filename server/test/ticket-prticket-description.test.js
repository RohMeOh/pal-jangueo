'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDetail } = require('../scripts/discover-prticket');

function documentFor(body) {
  return `<html><head><meta property="og:title" content="Concierto Boricua: Esencia - Teatro"></head><body><h1>Concierto Boricua: Esencia</h1>${body}</body></html>`;
}

test('description survives an introductory unlabelled event date before the official date marker', () => {
  const html = documentFor(`
    <p>El domingo 25 de abril de 2027, a las 4:30 p. m.,
      vuelve un concierto de boleros con músicos en vivo.</p>
    <p>Será una tarde para cantar y escuchar interpretaciones musicales.</p>
    <p>📅 25 de abril de 2027</p>
    <p>🕟 4:30 p. m.</p>
    <p>Precio: $25</p><p>PRticket Terms of Use</p>`);
  const detail = extractDetail(html);
  assert.ok(detail.description_evidence?.includes('músicos en vivo'));
  assert.ok(detail.description_evidence?.includes('El domingo 25 de abril de 2027'));
  assert.equal(detail.date_evidence, '25 de abril de 2027');
  assert.equal(detail.time_evidence, '4:30 p. m.');
  assert.ok(!detail.description_evidence.includes('Precio'));
  assert.ok(!detail.description_evidence.includes('Terms of Use'));
});

test('labelled Fecha boundary also preserves earlier dates in the prose', () => {
  const html = documentFor(`<p>El 12 de mayo de 2028 habrá
    una presentación musical de una banda en vivo.</p>
    <p>Fecha: 12 de mayo de 2028</p><p>Precio: $20</p>`);
  const detail = extractDetail(html);
  assert.ok(detail.description_evidence?.includes('presentación musical'));
  assert.ok(!detail.description_evidence.includes('Precio'));
});

test('weekday-only descriptions keep the previous fallback behavior', () => {
  const html = documentFor(`<p>Concierto de música en vivo en Puerto Rico.</p>
    <p>sábado 7 de noviembre de 2026</p><p>Precio: $20</p>`);
  const detail = extractDetail(html);
  assert.equal(detail.date_evidence, 'sábado 7 de noviembre de 2026');
  assert.match(detail.description_evidence, /Concierto de música en vivo/);
  assert.ok(!detail.description_evidence.includes('Precio'));
});

test('unlabelled date in unrelated text is not treated as official event date', () => {
  const html = documentFor(`<p>Una historia sobre el 7 de noviembre de 2026.</p>
    <p>Sin fecha de evento confirmada.</p>`);
  assert.equal(extractDetail(html).date_evidence, null);
});
