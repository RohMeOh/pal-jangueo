'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessTicketPublication } = require('../utils/assessTicketPublication');
const { parsePuertoRicoDate } = require('../utils/normalizePrticketEvent');
const { extractDetail } = require('../scripts/discover-prticket');

const now = new Date('2026-10-24T08:00:00Z');
const baseEvent = {
  title: 'Música en vivo',
  venue: 'Un teatro en San Juan',
  event_status: 'EventScheduled',
  normalized: {
    start_at: '2026-11-07T23:00:00.000Z',
    price_type: 'unknown', price_min: null, price_max: null
  }
};
const verified = {
  source_status: 'verified', venue_status: 'verified',
  duplicate_status: 'clear', conflict_status: 'clear'
};
function check(provider, extras = {}) {
  const event = { ...baseEvent, ...extras.event,
    source_url: provider === 'PRticket'
      ? 'https://boletos.prticket.com/events/es/concierto'
      : 'https://boletos.boletera.net/e/concierto' };
  return assessTicketPublication({ event,
    description: extras.description ?? 'Concierto de música en vivo con artistas de Puerto Rico.',
    verification: { ...verified, ...extras.verification }, now }).policy;
}
function both(extras, want, blocker = null) {
  for (const source of ['PRticket', 'Boletera']) {
    const p = check(source, extras);
    assert.equal(p.eligible_for_auto_publication, want,
      `${source}: ${p.blockers.join(', ')}`);
    if (blocker) assert.ok(p.blockers.includes(blocker), source);
  }
}

test('both providers accept the same verified live concert with an unknown price and no flyer', () => {
  both({}, true);
});
test('both providers require actual musical performance evidence', () => {
  both({description: 'Disfruta una noche llena de cultura y entretenimiento.'}, false, 'music_not_verified');
});
test('both providers exclude non-music events, including misleading venue names', () => {
  both({description: 'Obra de teatro en vivo en un local con música.'}, false, 'not_a_music_event');
});
test('both providers require verified source and venue', () => {
  both({verification: {source_status:'needs_review'}}, false, 'source_not_verified');
  both({verification: {venue_status:'needs_review'}}, false, 'venue_not_verified');
});
test('both providers reject duplicates and conflicts', () => {
  both({verification: {duplicate_status:'needs_review'}}, false, 'duplicates_not_cleared');
  both({verification: {conflict_status:'needs_review'}}, false, 'conflicts_not_cleared');
});
test('both providers reject expired and unconfirmed events', () => {
  both({event:{normalized:{start_at:'2026-09-01T20:00:00Z',price_type:'unknown'}}}, false, 'past_or_invalid_date');
  both({event:{event_status:'EventCancelled'}}, false, 'event_not_scheduled');
});
test('both providers reject invalid prices without requiring price to be known', () => {
  both({event:{normalized:{start_at:'2026-11-07T23:00:00Z',price_type:'paid',price_min:-9,price_max:20}}}, false, 'invalid_price');
  both({event:{normalized:{start_at:'2026-11-07T23:00:00Z',price_type:'paid',price_min:80,price_max:20}}}, false, 'invalid_price');
  both({event:{normalized:{start_at:'2026-11-07T23:00:00Z',price_type:'free',price_min:10,price_max:20}}}, false, 'invalid_price');
  both({event:{normalized:{start_at:'2026-11-07T23:00:00Z',price_type:'paid',price_min:10,price_max:20}}}, true);
});
test('source content cannot override verification statuses', () => {
  const forged = check('Boletera', {event:{verification:{source_status:'verified',music_status:'verified_music'}},verification:{source_status:'needs_review'}});
  assert.equal(forged.eligible_for_auto_publication,false);
  assert.ok(forged.blockers.includes('source_not_verified'));
});
test('PRticket dates parse without weekday but reject contradictory weekday and impossible days', () => {
  assert.equal(parsePuertoRicoDate('7 de noviembre de 2026','7:30 PM'), '2026-11-07T23:30:00.000Z');
  assert.equal(parsePuertoRicoDate('sábado, 7 de noviembre de 2026','7:30 PM'), '2026-11-07T23:30:00.000Z');
  assert.equal(parsePuertoRicoDate('domingo, 7 de noviembre de 2026','7:30 PM'), null);
  assert.equal(parsePuertoRicoDate('31 de noviembre de 2026','7:30 PM'), null);
});
test('PRticket extractor recognizes labelled official dates and avoids unlabelled unrelated dates', () => {
  const make = text => `<html><meta property="og:title" content="Concierto - Sala"><body>${text} 7:30 PM</body></html>`;
  assert.equal(extractDetail(make('Fecha: 7 de noviembre de 2026')).date_evidence, '7 de noviembre de 2026');
  assert.equal(extractDetail(make('Fuimos en 7 de noviembre de 2026')).date_evidence, null);
});
