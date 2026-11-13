'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDetail } = require('../scripts/discover-prticket');

function htmlFor(body) {
  return `<!doctype html><html><head>
    <meta property="og:title" content="Ricky Colón: Esencia - Moneró Café Teatro y Bar (CBA Caguas)">
    </head><body>${body}</body></html>`;
}

test('PRticket preserves SINOPSIS with a weekday date inside its prose', () => {
  const html = htmlFor(`
    Comprar Comprar CAFÉ TEATRO MONERÓ · PRTICKET
    Ricky Colón: Esencia SINOPSIS
    El domingo 25 de abril de 2027, a las 4:30 p. m., el escenario
    se llenará de música y bolero. Una velada para cantar y recordar.
    FECHAS DEL EVENTO ABRIL DE 2027 Precios: $30 Acerca de PRticket
  `);
  const detail = extractDetail(html);
  assert.match(detail.description_evidence || '', /domingo 25 de abril de 2027/i);
  assert.match(detail.description_evidence || '', /bolero/i);
  assert.doesNotMatch(detail.description_evidence || '', /FECHAS DEL EVENTO|Precios:|Acerca de/i);
  assert.equal(detail.date_evidence, 'domingo 25 de abril de 2027');
  assert.equal(detail.time_evidence, '4:30 p. m.');
});

test('PRticket still prioritizes an explicitly labelled official date', () => {
  const html = htmlFor(`
    Comprar Comprar Ricky Colón: Esencia SINOPSIS
    El domingo 25 de abril de 2027 cantaremos boleros, con música en vivo.
    \uD83D\uDDD3\uFE0F Sábado, 14 de noviembre de 2026
    \u23F0 8:00 PM Precios: $30 Acerca de PRticket
  `);
  const detail = extractDetail(html);
  assert.match(detail.description_evidence || '', /domingo 25 de abril de 2027/i);
  assert.doesNotMatch(detail.description_evidence || '', /Sábado, 14 de noviembre de 2026/i);
  assert.equal(detail.date_evidence, 'Sábado, 14 de noviembre de 2026');
});

test('PRticket does not enlarge descriptions without a trusted section boundary', () => {
  const html = htmlFor(`
    Comprar Comprar Ricky Colón: Esencia SINOPSIS
    El domingo 25 de abril de 2027 tuvimos una charla.
    Precios: $30 Acerca de PRticket
  `);
  const detail = extractDetail(html);
  assert.equal(detail.description_evidence, null);
});
