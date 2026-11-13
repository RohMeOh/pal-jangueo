const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDetail } = require('../scripts/discover-prticket');

test('does not extract cookies when only the metadata has the exact title', () => {
  const html = `
    <meta property="og:title" content="Título completo - Multiple Locations">
    <!-- Título completo - Multiple Locations -->
    <div>Sobre tu privacidad. Google Analytics. Guardar.</div>
    <h1>Título abreviado</h1>
    <button>Comprar</button><button>Comprar</button>
    <div>Cuando un asesinato sacude a los invitados,
    el detective decide investigar el misterio.</div>
    <div>\uD83D\uDDD3 sábado, 27 de febrero de 2027 \u23F0 8:30 PM</div>
    <footer>Acerca de. Política de privacidad.</footer>
  `;
  const result = extractDetail(html);
  assert.match(result.description_evidence, /detective decide investigar/);
  assert.doesNotMatch(
    result.description_evidence,
    /privacidad|Analytics|Guardar|Acerca de/
  );
});
