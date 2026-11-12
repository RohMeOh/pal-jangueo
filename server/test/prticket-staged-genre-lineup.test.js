'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const {
  assessTicketPublication
} = require('../utils/assessTicketPublication');

const verified = {
  source_status: 'verified',
  venue_status: 'verified',
  duplicate_status: 'clear',
  conflict_status: 'clear'
};

const concert = `
  Una experiencia musical inolvidable con un junte de
  grandes exponentes de la salsa, la bachata y la
  música tropical.
  En tarima: El Chaval de la Bachata, Tony Vega,
  Alex Sensation, Víctor Roque y La Gran Manzana.
`;

function policy(description, provider, verification = verified) {
  return assessTicketPublication({
    event: {
      title: 'Concierto de prueba',
      venue: 'Local verificado',
      source_url: provider === 'PRticket'
        ? 'https://boletos.prticket.com/events/es/prueba'
        : 'https://boletos.boletera.net/e/prueba',
      event_status: 'EventScheduled',
      normalized: {
        start_at: '2026-12-06T14:00:00.000Z',
        price_type: 'unknown'
      }
    },
    description,
    verification,
    now: new Date('2026-11-12T12:00:00Z')
  }).policy;
}

test('Explicit musical lineup on stage is recognized', () => {
  const result = assessMusicEvidence(concert);

  assert.equal(result.has_musical_program_evidence, true);
  assert.ok(result.signals.includes(
    'Cartel de artistas musicales en tarima'
  ));

  for (const provider of ['PRticket', 'Boletera']) {
    assert.equal(
      policy(concert, provider).eligible_for_auto_publication,
      true
    );
  }
});

const excluded = [
  'Una noche de salsa, bachata y música tropical.',

  'Experiencia musical con exponentes de la salsa, ' +
    'sin actuaciones anunciadas.',

  'Una experiencia musical con exponentes de la salsa. ' +
    'En tarima: charla sobre historia musical.',

  'Una experiencia musical con exponentes de la salsa. ' +
    'En tarima: un panel de discusión.',

  'Una obra de teatro con exponentes de la salsa. ' +
    'Experiencia musical. En tarima: elenco teatral.',

  'Festival con exponentes de la salsa. ' +
    'Experiencia musical. En tarima: artistas invitados.'
];

for (const [index, description] of excluded.entries()) {
  test(`Non-qualifying example ${index + 1} stays blocked`, () => {
    for (const provider of ['PRticket', 'Boletera']) {
      assert.equal(
        policy(description, provider).eligible_for_auto_publication,
        false
      );
    }
  });
}

test('Music evidence never bypasses venue verification', () => {
  const result = policy(concert, 'PRticket', {
    ...verified,
    venue_status: 'needs_review'
  });

  assert.equal(result.eligible_for_auto_publication, false);
  assert.ok(result.blockers.includes('venue_not_verified'));
});
