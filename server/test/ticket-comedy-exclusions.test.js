'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const {
  assessTicketPublication
} = require('../utils/assessTicketPublication');

function assessBoth(description) {
  return ['PRticket', 'Boletera'].map(provider => {
    const event = {
      title: 'Evento de prueba',
      venue: 'Local verificado',
      source_url: provider === 'PRticket'
        ? 'https://boletos.prticket.com/events/es/prueba'
        : 'https://boletos.boletera.net/e/prueba',
      event_status: 'EventScheduled',
      normalized: {
        start_at: '2027-11-01T23:00:00Z',
        price_type: 'unknown'
      }
    };

    return assessTicketPublication({
      event,
      description,
      verification: {
        source_status: 'verified',
        venue_status: 'verified',
        duplicate_status: 'clear',
        conflict_status: 'clear'
      },
      now: new Date('2026-10-27T12:00:00Z')
    }).policy;
  });
}

test('Stand-up comedy with incidental music is blocked', () => {
  const description =
    'Noches de Impro presenta Stand Up Comedy de Kiko Blade. ' +
    'Habrá música en vivo antes y después del espectáculo.';

  const music = assessMusicEvidence(description);

  assert.equal(
    music.classification,
    'evento_mixto_pendiente_de_verificar'
  );

  for (const policy of assessBoth(description)) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});

test('Standalone stand-up comedy is excluded', () => {
  const description =
    'Noche de stand-up comedy con varios comediantes.';

  assert.equal(
    assessMusicEvidence(description).classification,
    'evento_no_musical'
  );

  for (const policy of assessBoth(description)) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});

test('Comedy show with live concert remains excluded', () => {
  const description =
    'Show de comedia con invitados y concierto de rock en vivo.';

  for (const policy of assessBoth(description)) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});

test('A theater venue name does not exclude a concert', () => {
  const description =
    'Concierto de salsa en vivo en el Café Teatro de la Comedia.';

  for (const policy of assessBoth(description)) {
    assert.equal(policy.eligible_for_auto_publication, true);
  }
});

test('Musical improvisation remains eligible', () => {
  const description =
    'Concierto de jazz en vivo con improvisación de saxofón.';

  for (const policy of assessBoth(description)) {
    assert.equal(policy.eligible_for_auto_publication, true);
  }
});
