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


test('an official on-stage lineup appearing after event date can be extracted', () => {
  const html = `<html><head>
    <meta property="og:title" content="Día Nacional del Bailador - Coliseo Roberto Clemente">
    </head><body><h1>Día Nacional del Bailador</h1>
    <p>¡EL DÍA NACIONAL DEL BAILADOR!</p>
    <p>📅 miércoles, 25 de noviembre de 2026</p>
    <p>⏰ 8:00 PM</p><p>📍 Coliseo Roberto Clemente, San Juan</p>
    <p>En tarima:</p><p>La Banda que Deleita</p>
    <p>Willie Rosario y su Orquesta</p>
    <p>Bobby Valentín y su Orquesta</p>
    <p>La Sonora Ponceña</p><p>Precios: VIP $75</p>
    <p>Acerca de Cookies y términos legales</p></body></html>`;
  const detail = extractDetail(html);
  assert.match(detail.description_evidence, /En tarima:/);
  assert.match(detail.description_evidence, /Willie Rosario/);
  assert.doesNotMatch(detail.description_evidence, /Precios|Cookies|VIP/);
});

test('unlabelled generic text after a date is not repurposed as musical evidence', () => {
  const html = documentFor(`<p>📅 12 de mayo de 2028</p>
    <p>⏰ 8:00 PM</p><p>📍 Teatro Principal</p>
    <p>Comprar boletos. Precios: $25.</p>`);
  assert.equal(extractDetail(html).description_evidence, null);
});
