'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');
const { assessTicketPublication } = require('../utils/assessTicketPublication');
const { assessBoleteraMusicCandidate } = require('../utils/assessBoleteraMusicCandidate');

const now = new Date('2026-10-24T12:00:00Z');
const verification = {
  source_status: 'verified', venue_status: 'verified',
  duplicate_status: 'clear', conflict_status: 'clear'
};
function decision(provider, description) {
  return assessTicketPublication({
    event: {
      title: 'Evento musical', venue: 'Local confirmado',
      source_url: provider === 'PRticket'
        ? 'https://boletos.prticket.com/events/es/ejemplo'
        : 'https://boletos.boletera.net/e/ejemplo',
      event_status: 'EventScheduled',
      normalized: { start_at: '2026-11-17T23:00:00.000Z',
        price_type: 'unknown', price_min: null, price_max: null }
    }, description, verification, now
  }).policy;
}
const examples = [
  ['EliA', 'Elia se presentará junto a su banda en vivo, interpretando su nuevo sencillo y temas de su primer álbum.'],
  ['La Armada', 'PRODUCCIONES presentan MÚSICA PESADA DEL CARIBE, con el regreso a Puerto Rico de LA ARMADA junto a GANGRENESIA. Una noche de música extrema con una de las bandas más icónicas.'],
  ['Santurce Dub Club', 'La noche comienza con reggae, dub y roots, seguido por la presentación estelar de Johnny Clarke.'],
  ['Live concert', 'Live music performance con artistas de Puerto Rico.']
];
for (const [name, description] of examples) {
  test(`${name}: explicit musical performance counts for BOTH sources`, () => {
    const e = assessMusicEvidence(description);
    assert.equal(e.has_musical_program_evidence, true);
    for (const provider of ['PRticket','Boletera']) {
      assert.equal(decision(provider,description).eligible_for_auto_publication, true, provider);
    }
    assert.equal(assessBoleteraMusicCandidate({event_type:'MusicEvent', description_raw:description}).eligibleForReview, true);
  });
}
const notEnough = [
  ['anniversary of an album', 'Celebramos 20 años del primer disco. Una noche para volver a las canciones y a los recuerdos.'],
  ['generic musical genre', 'Una noche de reggae, rock y música.'],
  ['name only', 'La banda legendaria anuncia un álbum nuevo.'],
  ['general entertainment', 'Una noche de experiencias y sorpresas para todos.']
];
for (const [name, description] of notEnough) {
  test(`${name}: musical context alone must not auto-publish`, () => {
    for (const provider of ['PRticket','Boletera']) {
      const policy = decision(provider,description);
      assert.equal(policy.eligible_for_auto_publication,false,provider);
      assert.ok(policy.blockers.includes('music_not_verified'),provider);
    }
  });
}
test('theater exclusions remain in force for BOTH ticketing sources', () => {
  const description='Obra de teatro con orquesta en vivo y músicos, función teatral.';
  for (const provider of ['PRticket','Boletera']) {
    const policy=decision(provider,description);
    assert.equal(policy.eligible_for_auto_publication,false,provider);
    assert.equal(policy.status,'excluded_non_music',provider);
  }
});
test('positive music signals do NOT waive another verification requirement', () => {
  const description=examples[0][1];
  const event={ title:'EliA',venue:'La Caverna',source_url:'https://boletos.boletera.net/e/elia-en-vivo',event_status:'EventScheduled',normalized:{start_at:'2026-11-07T23:00:00Z',price_type:'unknown'}};
  const policy=assessTicketPublication({event,description,now,verification:{...verification,venue_status:'needs_review'}}).policy;
  assert.equal(policy.eligible_for_auto_publication,false);
  assert.ok(policy.blockers.includes('venue_not_verified'));
});
