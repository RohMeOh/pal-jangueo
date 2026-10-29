const test = require('node:test');
const assert = require('node:assert/strict');

const {
  existingCandidateDecision
} = require('../utils/storePendingEventCandidate');

function record(status, hash = 'old', approved = null) {
  return {
    review_status: status,
    source_content_hash: hash,
    approved_event_id: approved
  };
}

test('New source can create a candidate', () => {
  assert.equal(existingCandidateDecision([], 'new'), 'INSERT');
});

test('Rejected source with changed evidence can be reviewed again', () => {
  assert.equal(
    existingCandidateDecision([record('rejected')], 'new'),
    'INSERT'
  );
});

test('Needs-more-info source can be reviewed again', () => {
  assert.equal(
    existingCandidateDecision([record('needs_more_info')], 'new'),
    'INSERT'
  );
});

test('Identical rejected evidence is not restaged', () => {
  assert.equal(
    existingCandidateDecision([record('rejected')], 'old'),
    'YA_EXISTE'
  );
});

test('Pending candidate is not duplicated after source changes', () => {
  assert.equal(
    existingCandidateDecision([record('pending_review')], 'new'),
    'FUENTE_CAMBIO_REQUIERE_REVISION'
  );
});

test('Approved event cannot be automatically restaged', () => {
  assert.equal(
    existingCandidateDecision(
      [record('approved', 'old', 'existing-event-id')],
      'new'
    ),
    'FUENTE_CAMBIO_REQUIERE_REVISION'
  );
});
