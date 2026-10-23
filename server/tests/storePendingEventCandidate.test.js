const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCandidate
} = require('../utils/storePendingEventCandidate');

const {
  buildSourceContentHash
} = require('../utils/sourceContentHash');

function candidate() {
  const sourceUrl =
    'https://boletos.prticket.com/events/es/concierto-prueba';

  const captionText = JSON.stringify({
    title: 'Concierto de prueba',
    venue: 'Local de prueba'
  });

  return {
    sourceName: 'PRticket',
    sourceUrl,
    flyerUrl:
      'https://dgxrvn37x26wa.cloudfront.net/events/img_web/test/m_poster.jpg',
    captionText,
    sourceContentHash: buildSourceContentHash({
      captionText
    }),
    analysis: {
      status: 'pending_review',
      source: {
        name: 'PRticket',
        url: sourceUrl
      },
      event: {
        title: 'Concierto de prueba',
        venue: 'Local de prueba',
        is_music_event: false,
        event_status: 'unverified',
        normalized: {
          start_at: '2026-12-06T00:00:00.000Z'
        }
      },
      validation: {
        safe_to_publish: false
      }
    }
  };
}

test('Accepts a properly staged pending candidate', () => {
  assert.doesNotThrow(() => validateCandidate(candidate()));
});

test('Rejects an unauthorized source', () => {
  const input = candidate();
  input.sourceUrl = 'https://example.com/events/es/concierto';

  assert.throws(() => validateCandidate(input));
});

test('Rejects a modified content hash', () => {
  const input = candidate();
  input.sourceContentHash = 'incorrect-hash';

  assert.throws(() => validateCandidate(input));
});

test('Rejects an unverified claim of music', () => {
  const input = candidate();
  input.analysis.event.is_music_event = true;

  assert.throws(() => validateCandidate(input));
});

test('Rejects events already marked as scheduled', () => {
  const input = candidate();
  input.analysis.event.event_status = 'EventScheduled';

  assert.throws(() => validateCandidate(input));
});

test('Rejects an unauthorized flyer host', () => {
  const input = candidate();
  input.flyerUrl = 'https://example.com/poster.jpg';

  assert.throws(() => validateCandidate(input));
});

test('Rejects expired events', () => {
  const input = candidate();
  input.analysis.event.normalized.start_at =
    '2026-01-01T00:00:00.000Z';

  assert.throws(() => validateCandidate(input));
});
