'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');
const { assessTicketPublication } = require('../utils/assessTicketPublication');

const verification = {
  source_status: 'verified', venue_status: 'verified',
  duplicate_status: 'clear', conflict_status: 'clear'
};
const eventFor = source => ({
  title:'Velada de boleros', venue:'Local verificado',
  source_url: source === 'PRticket'
    ? 'https://boletos.prticket.com/events/es/prueba'
    : 'https://boletos.boletera.net/e/prueba',
  event_status:'EventScheduled',
  normalized: { start_at:'2027-04-25T20:30:00.000Z',
    price_type:'unknown', price_min:null, price_max:null }
});
const eventDescription = `El domingo 25 de abril de 2027, a las 4:30 p. m.,
  el escenario del Café Teatro en Caguas se llenará nuevamente de música,
  nostalgia y sentimiento. Disfruta una velada dedicada a la magia del bolero,
  canciones que cuentan historias. Será una tarde para cantar, recordar y
  disfrutar de una auténtica bohemia. Detrás de cada interpretación hay un sentimiento.`;

test('stage + interpretation + musical context accepts a verified live act for BOTH providers', () => {
  const evidence = assessMusicEvidence(eventDescription);
  assert.equal(evidence.has_musical_program_evidence, true);
  assert.ok(evidence.signals.includes('Interpretación musical anunciada en escenario'));
  for (const provider of ['PRticket', 'Boletera']) {
    const result=assessTicketPublication({
      event:eventFor(provider), description:eventDescription,
      verification, now:new Date('2026-10-24T12:00:00Z')
    });
    assert.equal(result.policy.eligible_for_auto_publication, true, provider);
  }
});

const negative=[
  'El escenario presenta una charla. Habrá boleros y canciones de fondo, para recordar.',
  'Noche para cantar y escuchar boleros; música ambiental en el local.',
  'Se proyecta una película en el escenario con interpretación de canciones y música.',
  'Bohemia, interpretación y boleros para compartir en familia.',
  'Obra de teatro con escenario, boleros e interpretación musical.',
  'La música en el escenario acompaña una proyección de cine; interpretaciones de boleros.'
];
for (const [i,description] of negative.entries()) {
  test(`non-performance or mixed clue ${i+1} is not auto-approved for either provider`, () => {
    for (const provider of ['PRticket', 'Boletera']) {
      const result=assessTicketPublication({
        event:eventFor(provider),description,verification,
        now:new Date('2026-10-24T12:00:00Z')
      });
      assert.equal(result.policy.eligible_for_auto_publication,false,provider);
    }
  });
}
test('new signal does not override a missing venue verification',()=>{
  const result=assessTicketPublication({
    event:eventFor('PRticket'),description:eventDescription,
    verification:{...verification,venue_status:'needs_review'},
    now:new Date('2026-10-24T12:00:00Z')
  });
  assert.ok(result.policy.blockers.includes('venue_not_verified'));
  assert.equal(result.policy.eligible_for_auto_publication,false);
});
