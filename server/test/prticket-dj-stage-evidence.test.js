'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractDetail
} = require('../scripts/discover-prticket');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

const {
  assessTicketPublication
} = require('../utils/assessTicketPublication');

const description =
  'Two stages. Two music styles. Reggaeton Y2K and English hits. ' +
  'Two DJs. Two music styles.';

function policies(text) {
  return ['PRticket', 'Boletera'].map(provider =>
    assessTicketPublication({
      event: {
        title: 'Evento musical',
        venue: 'Local certificado',
        source_url: provider === 'PRticket'
          ? 'https://boletos.prticket.com/events/es/ejemplo'
          : 'https://boletos.boletera.net/e/ejemplo',
        event_status: 'EventScheduled',
        normalized: {
          start_at: '2027-11-01T23:00:00Z',
          price_type: 'unknown'
        }
      },
      description: text,
      verification: {
        source_status: 'verified',
        venue_status: 'verified',
        duplicate_status: 'clear',
        conflict_status: 'clear'
      },
      now: new Date('2026-10-27T12:00:00Z')
    }).policy
  );
}

test('Extracts official DJ programme after event price', () => {
  const html = `<html><head>
    <meta property="og:title"
      content="Y2KOMEBACK - Logans Irish Pub">
    <meta property="og:description"
      content="Two stages. Two music styles. Reggaeton Y2K.">
    </head><body>
    <h1>Y2KOMEBACK</h1>
    <p>🗓️ sábado, 31 de octubre de 2026</p>
    <p>⏰ 9:00 PM</p>
    <p>Precio: $20.00</p>
    <p>Two DJs. Two music styles. One Y2KOMEBACK.</p>
    <p>Acerca de Cookies y otros servicios</p>
    </body></html>`;

  const detail = extractDetail(html);

  assert.match(detail.description_evidence, /Two stages/);
  assert.match(detail.description_evidence, /Two DJs/);
  assert.doesNotMatch(
    detail.description_evidence, /Cookies|Precio/
  );
});

test('Verified multi-stage DJ programme qualifies for both', () => {
  assert.equal(
    assessMusicEvidence(description).has_musical_program_evidence,
    true
  );

  for (const policy of policies(description)) {
    assert.equal(policy.eligible_for_auto_publication, true);
  }
});

test('Music styles without performers remain blocked', () => {
  for (const policy of policies(
    'Two stages. Two music styles. Reggaeton Y2K.'
  )) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});

test('Two DJs without stages remain insufficient', () => {
  for (const policy of policies(
    'Two DJs. Two music styles. Party with lights.'
  )) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});

test('Stand-up comedy with DJs remains excluded', () => {
  const mixed =
    'Stand Up Comedy with performers. ' + description;

  for (const policy of policies(mixed)) {
    assert.equal(policy.eligible_for_auto_publication, false);
  }
});
