'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');

test('VOCES DE AMERICA: orchestral solo counts as musical performance', () => {
  const description = `VOCES DE AMERICA. Un programa dedicado a las voces
    sinfónicas y compositores del continente. El maestro Jaime Morales
    dirige la orquesta desde el atril y a la vez interpreta la parte
    solista de trombón. La segunda parte incluye la Sinfonía India.`;
  const result = assessMusicEvidence(description);
  assert.equal(result.classification, 'indicios_de_actuacion_musical');
  assert.equal(result.has_musical_program_evidence, true);
  assert.ok(result.signals.includes('Interpretación solista con orquesta dirigida'));
  assert.equal(result.safe_to_publish, false);
});

test('mentioning a historical orchestral performance in a conference is not enough', () => {
  const result = assessMusicEvidence(
    'Conferencia sobre el maestro que dirige la orquesta e interpreta ' +
    'la parte solista de trombón en una sinfonía histórica.'
  );
  assert.equal(result.has_musical_program_evidence, false);
});

test('a theatrical show with a live orchestral solo remains excluded', () => {
  const result = assessMusicEvidence(
    'Obra de teatro donde el director dirige la orquesta e interpreta ' +
    'la parte solista de trombón de una sinfonía.'
  );
  assert.equal(result.has_musical_program_evidence, false);
  assert.equal(result.non_music_event_detected, true);
});

test('title alone does not confirm the musical performance', () => {
  const result = assessMusicEvidence('VOCES DE AMERICA');
  assert.equal(result.has_musical_program_evidence, false);
});
