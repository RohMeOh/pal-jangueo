const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDetail } = require('../scripts/discover-prticket');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');

test('recovers concert prose when its heading differs from its full title', () => {
  const html = `
    <meta property="og:title"
      content="Concierto Generacional - 65 Aniversario Tuna UPR - Teatro UPR">
    <div>Sobre tu privacidad. Aceptar todo.</div>
    <h1>Concierto Generacional - 65 Aniversario Tuna UPR</h1>
    <button>Coming Soon</button><button>Coming Soon</button>
    <div>65 Aniversario Tuna UPR. Concierto Generacional.
    Cada generación entonará canciones de sus repertorios.</div>
    <div>🗓 domingo, 6 de diciembre de 2026 ⏰ 4:00 PM</div>
    <footer>Acerca de. Política de privacidad.</footer>
  `;
  const detail = extractDetail(html);
  assert.match(detail.description_evidence, /entonará canciones/);
  assert.doesNotMatch(detail.description_evidence, /privacidad|Aceptar todo|Acerca de/);
  assert.equal(
    assessMusicEvidence(detail.description_evidence).has_musical_program_evidence,
    true
  );
});

test('recognizes tunas announced on stage with a musical repertoire', () => {
  const result = assessMusicEvidence(
    'En tarima estará la Tuna Universitaria y otras tunas. ' +
    'Cuentan con un repertorio variado que incluye música puertorriqueña.'
  );
  assert.equal(result.has_musical_program_evidence, true);
});

test('a tuna reference alone is insufficient', () => {
  assert.equal(
    assessMusicEvidence('Celebración del aniversario de la Tuna UPR.')
      .has_musical_program_evidence,
    false
  );
});

test('comedy remains mixed even with an announced tuna performance', () => {
  const result = assessMusicEvidence(
    'Noche de stand-up comedy. En tarima estará la Tuna Universitaria ' +
    'con un repertorio de música navideña.'
  );
  assert.equal(result.has_musical_program_evidence, false);
  assert.equal(result.mixed_event_detected, true);
});
