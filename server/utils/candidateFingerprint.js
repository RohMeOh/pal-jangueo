// Pa'l Jangueo - Potential duplicate detection

const { createHash } = require('node:crypto');

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildCandidateFingerprint(event, isTest = true) {
  const venue = normalizeName(event?.venue);

  const mainArtist = event?.artists?.find(
    artist => artist.role === 'principal'
  );

  const artist = normalizeName(mainArtist?.name);

  const timestamp = Date.parse(
    event?.normalized?.start_at ?? ''
  );

  // Insufficient information: do not guess an identity.
  if (!venue || !artist || !Number.isFinite(timestamp)) {
    return null;
  }

  const startAt = new Date(timestamp).toISOString();

  const identity = JSON.stringify([
    isTest ? 'test' : 'real',
    startAt,
    venue,
    artist
  ]);

  return createHash('sha256')
    .update(identity)
    .digest('hex');
}

module.exports = { buildCandidateFingerprint };
