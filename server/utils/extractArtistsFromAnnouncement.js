// Pa'l Jangueo - Reusable artist extraction
// Reuses the existing Gemini event analyzer.
// Does not save, approve or publish events.

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasValidTextEvidence(item, sourceText) {
  const name = item?.name;
  const evidence = item?.evidence;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    evidence?.source !== 'text' ||
    typeof evidence.quote !== 'string' ||
    !evidence.quote.trim()
  ) {
    return false;
  }

  const quote = normalize(evidence.quote);

  return (
    normalize(sourceText).includes(quote) &&
    quote.includes(normalize(name))
  );
}

async function extractArtistsFromAnnouncement({
  sourceText,
  sourceName = 'Fuente pública',
  sourceUrl = null
}) {
  if (
    typeof sourceText !== 'string' ||
    !sourceText.trim() ||
    sourceText.length > 15000
  ) {
    throw new Error(
      'El anuncio debe contener entre 1 y 15000 caracteres.'
    );
  }

  const script = path.join(
    __dirname,
    '..',
    'scripts',
    'analyze-event.js'
  );

  const args = [
    script,
    '--text', sourceText,
    '--source-name', sourceName
  ];

  if (sourceUrl) {
    args.push('--source-url', sourceUrl);
  }

  // No --save-test or --stage arguments are passed.
  const { stdout } = await execFileAsync(
    process.execPath,
    args,
    {
      cwd: path.join(__dirname, '..'),
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024
    }
  );

  const analysis = JSON.parse(stdout);

  const extractedArtists = Array.isArray(analysis.event?.artists)
    ? analysis.event.artists
    : [];

  const extractedOrganizers = Array.isArray(analysis.event?.organizers)
    ? analysis.event.organizers
    : [];

  const artists = extractedArtists.filter(item =>
    hasValidTextEvidence(item, sourceText)
  );

  const organizers = extractedOrganizers.filter(item =>
    hasValidTextEvidence(item, sourceText)
  );

  return {
    source_name: sourceName,
    source_url: sourceUrl,

    artists,
    organizers,

    rejected_artist_claims:
      extractedArtists.length - artists.length,

    rejected_organizer_claims:
      extractedOrganizers.length - organizers.length,

    // Extracting a name does not establish local identity.
    local_music_confirmed: false,
    local_verification_status:
      'pending_cross_source_verification',

    safe_to_publish: false
  };
}

module.exports = { extractArtistsFromAnnouncement };
