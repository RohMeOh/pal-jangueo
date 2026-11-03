const test = require('node:test');
const assert = require('node:assert/strict');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');

const lineup =
  'Prepárate para una noche de perreo y recuerdos inolvidables. ' +
  'Frankie Boy, John Eric y J-King & Maximan se unen a DJ Adam, ' +
  'DJ Davey, Benny Blanco y DJ Negro para revivir la energía ' +
  'y el ambiente de una época que marcó historia.';

test('recognizes an announced dance programme with artists and multiple DJs', () => {
  assert.equal(
    assessMusicEvidence(lineup).has_musical_program_evidence,
    true
  );
});

for (const description of [
  'Una noche de perreo con recuerdos de DJ Adam y DJ Davey.',
  'Los invitados se unen a DJ Adam y DJ Davey en una conferencia.',
  lineup + ' Escucharemos una playlist de grabaciones.',
  lineup + ' Música de fondo durante un panel.'
]) {
  test('keeps ambiguous or recorded DJ context blocked: ' + description, () => {
    assert.equal(
      assessMusicEvidence(description).has_musical_program_evidence,
      false
    );
  });
}

test('a comedy programme remains mixed', () => {
  const result = assessMusicEvidence('Stand-up comedy. ' + lineup);
  assert.equal(result.has_musical_program_evidence, false);
  assert.equal(result.mixed_event_detected, true);
});
