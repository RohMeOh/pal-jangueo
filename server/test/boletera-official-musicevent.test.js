'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractEventJsonLd } = require('../utils/extractEventJsonLd');
const { assessBoleteraMusicCandidate } = require('../utils/assessBoleteraMusicCandidate');
const { assessMusicCatalogEligibility } = require('../utils/assessMusicCatalogEligibility');
const { assessTicketPublication } = require('../utils/assessTicketPublication');

const source = 'https://boletos.boletera.net/e/prueba-musical';
const music = {
  '@context': 'https://schema.org', '@type': 'MusicEvent',
  name: 'Prueba musical', startDate: '2026-11-17T19:00:00-04:00',
  eventStatus: 'https://schema.org/EventScheduled',
  description: 'Celebración artística sin detalles de artistas.',
  location: { name: 'Local PR', address: {addressLocality:'San Juan'} },
  offers: {url: source + '/tickets'}
};

function extracted(type) {
  const html = `<script type="application/ld+json">${JSON.stringify({ ...music, '@type': type })}</script>`;
  return extractEventJsonLd(html, source);
}

test('Boletera: official MusicEvent is eligible despite vague wording', () => {
  const records = extracted('MusicEvent');
  assert.equal(records.length, 1);
  assert.equal(assessBoleteraMusicCandidate(records[0]).eligibleForReview, true);
  assert.equal(assessBoleteraMusicCandidate({event_type: 'MusicEvent', description_raw: 'Noche de cine con música de fondo.'}).eligibleForReview, true);
});

test('Boletera: VisualArtsEvent stays excluded, even if description says concierto', () => {
  assert.equal(extracted('VisualArtsEvent').length, 0);
  assert.equal(assessBoleteraMusicCandidate({event_type: 'VisualArtsEvent', description_raw: 'Concierto de música en vivo'}).eligibleForReview, false);
});

const event = {title: 'Concierto', venue: 'Local PR', source_url: source,
  event_status: 'EventScheduled',
  normalized: {start_at:'2026-11-17T23:00:00.000Z',price_type:'unknown',price_min:null,price_max:null}};
const verification = {music_status: 'verified_music',source_status:'verified',
  venue_status:'verified',duplicate_status:'clear',conflict_status:'clear'};
const now = new Date('2026-10-27T12:00:00Z');
function policy(changes = {}) {
  return assessMusicCatalogEligibility({event:{...event,...changes.event},
    verification:{...verification,...changes.verification},now});
}

test('Official MusicEvent: price may be unknown but venue/source/duplicate/date protections remain', () => {
  assert.equal(policy().eligible_for_auto_publication, true);
  assert.equal(policy({verification:{venue_status:'needs_review'}}).eligible_for_auto_publication, false);
  assert.equal(policy({verification:{source_status:'needs_review'}}).eligible_for_auto_publication, false);
  assert.equal(policy({verification:{duplicate_status:'needs_review'}}).eligible_for_auto_publication, false);
  assert.equal(policy({event:{normalized:{...event.normalized,start_at:'2026-01-01T00:00:00Z'}}}).eligible_for_auto_publication, false);
  assert.equal(policy({verification:{music_status:'needs_review'}}).eligible_for_auto_publication, false);
});

test('PRticket retains the description-based policy', () => {
  const result = assessTicketPublication({
    event:{...event,source_url:'https://boletos.prticket.com/events/es/prueba'},
    description:'Una noche de experiencias y sorpresas.',
    verification:{source_status:'verified',venue_status:'verified',duplicate_status:'clear',conflict_status:'clear'},
    now
  });
  assert.equal(result.policy.eligible_for_auto_publication, false);
  assert.ok(result.policy.blockers.includes('music_not_verified'));
});
