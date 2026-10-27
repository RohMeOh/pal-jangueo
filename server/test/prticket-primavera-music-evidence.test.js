'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const {
  assessTicketPublication
} = require('../utils/assessTicketPublication');

const description =
  'Dianne De Jesus nos regala una noche llena de música y palabra; ' +
  'con su banda nos trae un tiempo para conectar con Dios; ' +
  'en un espacio hermoso lleno de esperanza, arte y poder.';

function assess(descriptionText, venueStatus = 'verified') {
  return assessTicketPublication({
    event: {
      title: 'Primavera : Dianne de Jesús',
      venue: 'Centro de Bellas Artes de Santurce',
      source_url:
        'https://boletos.prticket.com/events/es/primavera',
      event_status: 'EventScheduled',
      normalized: {
        start_at: '2027-01-22T23:00:00.000Z',
        price_type: 'unknown',
        price_min: null,
        price_max: null
      }
    },
    description: descriptionText,
    verification: {
      source_status: 'verified',
      venue_status: venueStatus,
      duplicate_status: 'clear',
      conflict_status: 'clear'
    },
    now: new Date('2026-10-27T00:00:00.000Z')
  });
}

test('Primavera: official band announcement qualifies', () => {
  const result = assessMusicEvidence(description);

  assert.equal(result.has_musical_program_evidence, true);
  assert.equal(result.non_music_event_detected, false);
  assert.equal(result.mixed_event_detected, false);
  assert.ok(
    result.signals.includes(
      'Noche musical con banda anunciada'
    )
  );
});

test('Primavera passes shared publication policy', () => {
  const result = assess(description);

  assert.equal(
    result.policy.eligible_for_auto_publication,
    true
  );
});

test('Music signal cannot bypass unverified venue', () => {
  const result = assess(description, 'needs_review');

  assert.equal(
    result.policy.eligible_for_auto_publication,
    false
  );
});

test('Generic music and band context stays insufficient', () => {
  const result = assessMusicEvidence(
    'Una noche llena de música con su banda.'
  );

  assert.equal(result.has_musical_program_evidence, false);
});

test('Background music never qualifies through new rule', () => {
  const result = assessMusicEvidence(
    'Nos regala una noche llena de música de fondo; ' +
    'con su banda celebraremos la ocasión.'
  );

  assert.equal(result.has_musical_program_evidence, false);
});

test('Theater or panel does not qualify', () => {
  for (const prefix of [
    'Una obra de teatro. ',
    'Una charla y panel. '
  ]) {
    const result = assessMusicEvidence(
      prefix + description
    );

    assert.equal(
      result.has_musical_program_evidence,
      false
    );
  }
});
