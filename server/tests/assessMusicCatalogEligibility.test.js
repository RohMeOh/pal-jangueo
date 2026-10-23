const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessMusicCatalogEligibility
} = require('../utils/assessMusicCatalogEligibility');

const event = {
  title: 'Concierto de prueba',
  venue: 'Local de prueba',
  event_status: 'EventScheduled',
  source_url: 'https://example.org/evento',
  normalized: {
    start_at: '2026-12-06T00:00:00.000Z'
  }
};

const verification = {
  source_status: 'verified',
  music_status: 'verified_music',
  venue_status: 'verified',
  duplicate_status: 'clear',
  conflict_status: 'clear',
  independent_scene_status: 'unknown'
};

const now = new Date('2026-10-23T12:00:00Z');

test('Allows verified music without independent scene status', () => {
  const result = assessMusicCatalogEligibility({
    event,
    verification,
    now
  });

  assert.equal(result.eligible_for_auto_publication, true);
  assert.equal(result.scene_category, 'general_music');
});

test('Independent scene remains an optional category', () => {
  const result = assessMusicCatalogEligibility({
    event,
    verification: {
      ...verification,
      independent_scene_status: 'verified'
    },
    now
  });

  assert.equal(result.eligible_for_auto_publication, true);
  assert.equal(result.scene_category, 'independent_scene');
});

test('Rejects confirmed non-music events', () => {
  const result = assessMusicCatalogEligibility({
    event,
    verification: {
      ...verification,
      music_status: 'non_music'
    },
    now
  });

  assert.equal(result.status, 'excluded_non_music');
});

test('Blocks missing verification', () => {
  const result = assessMusicCatalogEligibility({
    event,
    verification: {
      ...verification,
      source_status: 'unknown'
    },
    now
  });

  assert.equal(result.eligible_for_auto_publication, false);
});

test('Blocks expired events', () => {
  const result = assessMusicCatalogEligibility({
    event: {
      ...event,
      normalized: {
        start_at: '2026-01-01T00:00:00.000Z'
      }
    },
    verification,
    now
  });

  assert.equal(result.eligible_for_auto_publication, false);
});

test('Blocks potential duplicates', () => {
  const result = assessMusicCatalogEligibility({
    event,
    verification: {
      ...verification,
      duplicate_status: 'unchecked'
    },
    now
  });

  assert.equal(result.eligible_for_auto_publication, false);
});
