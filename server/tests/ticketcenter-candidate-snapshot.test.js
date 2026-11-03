const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ticketcenterCandidateSnapshot: snapshot
} = require('../utils/ticketcenterCandidateSnapshot');

function candidate() {
  return {
    id: 'candidate-id',
    source_url: 'https://tcpr.com/example',
    flyer_url: null,
    caption_text: 'Original evidence',
    source_content_hash: 'original-hash',
    analysis_result: {
      event: { title: 'Concert', venue_id: 'venue', normalized: {
        start_at: '2027-01-01T00:00:00.000Z'
      } },
      validation: { safe_to_publish: false }
    }
  };
}

test('unchanged evidence has the same snapshot', () => {
  const row = candidate();
  assert.equal(snapshot(row), snapshot(JSON.parse(JSON.stringify(row))));
});

test('JSON object key ordering does not change evidence identity', () => {
  const row = candidate();
  const reordered = candidate();
  reordered.analysis_result = {
    validation: { safe_to_publish: false },
    event: row.analysis_result.event
  };
  assert.equal(snapshot(row), snapshot(reordered));
});

for (const field of [
  'id', 'source_url', 'flyer_url', 'caption_text', 'source_content_hash'
]) {
  test('detects a changed ' + field, () => {
    const row = candidate();
    assert.notEqual(snapshot(row), snapshot({ ...row, [field]: 'changed' }));
  });
}

test('detects analysis edits even when the saved content hash is unchanged', () => {
  for (const mutate of [
    row => { row.analysis_result.event.venue_id = 'different-venue'; },
    row => { row.analysis_result.event.normalized.start_at = '2027-02-01T00:00:00Z'; },
    row => { row.analysis_result.event.title = 'Different concert'; },
    row => { row.analysis_result.validation.safe_to_publish = true; }
  ]) {
    const before = candidate();
    const after = candidate();
    mutate(after);
    assert.notEqual(snapshot(before), snapshot(after));
  }
});
