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

test('Rejected source with changed evidence requires review without duplication', () => {
  assert.equal(
    existingCandidateDecision([record('rejected')], 'new'),
    'FUENTE_CAMBIO_REQUIERE_REVISION'
  );
});

test('Needs-more-info source with changed evidence requires review without duplication', () => {
  assert.equal(
    existingCandidateDecision([record('needs_more_info')], 'new'),
    'FUENTE_CAMBIO_REQUIERE_REVISION'
  );
});

test('Identical rejected evidence is not restaged', () => {
  assert.equal(
    existingCandidateDecision([record('rejected')], 'old'),
    'YA_EXISTE'
  );
});

test('Changed pending evidence updates the existing candidate', () => {
  assert.equal(
    existingCandidateDecision([record('pending_review')], 'new'),
    'UPDATE_PENDING'
  );
});

test('Identical pending evidence needs no update', () => {
  assert.equal(
    existingCandidateDecision([record('pending_review')], 'old'),
    'YA_EXISTE'
  );
});

test('Pending candidate linked to an event cannot refresh', () => {
  assert.equal(
    existingCandidateDecision(
      [record('pending_review', 'old', 'event-id')], 'new'
    ),
    'FUENTE_CAMBIO_REQUIERE_REVISION'
  );
});

test('Ambiguous changed candidates cannot refresh', () => {
  assert.equal(
    existingCandidateDecision([
      record('pending_review'), record('pending_review')
    ], 'new'),
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
