// Pa'l Jangueo - Basic event validation

function comparableName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}


// Find spelling differences between extracted names and caption text.
function findCaptionSpelling(name, caption) {
  if (!name || !caption) return null;

  const expected = String(name).match(/[\p{L}\p{N}]+/gu) || [];
  const words = String(caption).match(/[\p{L}\p{N}]+/gu) || [];

  if (!expected.length || expected.join('').length < 3) {
    return null;
  }

  for (let i = 0; i <= words.length - expected.length; i++) {
    const candidate = words.slice(i, i + expected.length);

    const matches = candidate.every(
      (word, j) => comparableName(word) === comparableName(expected[j])
    );

    if (matches) {
      const found = candidate.join(' ');

      if (
        found.toLocaleLowerCase('es') !==
        expected.join(' ').toLocaleLowerCase('es')
      ) {
        return found;
      }
    }
  }

  return null;
}

function validateEvent(data) {
  const event = data.event || {};
  const issues = [];

  function addIssue(code, severity, message) {
    issues.push({ code, severity, message });
  }

  // 1. Confirm this is a music event.
  if (event.is_music_event !== true) {
    addIssue(
      'not_music_event',
      'error',
      'No se confirmó que sea un evento musical.'
    );
  }

  // 2. Require an event title.
  if (!event.title || !String(event.title).trim()) {
    addIssue(
      'missing_title',
      'error',
      'Falta el título del evento.'
    );
  }

  // 3. Require a venue.
  if (!event.venue || !String(event.venue).trim()) {
    addIssue(
      'missing_venue',
      'error',
      'Falta el lugar del evento.'
    );
  }

  // 4. Require a valid date and time.
  if (!event.normalized?.start_at) {
    addIssue(
      'missing_valid_datetime',
      'error',
      'No se pudo confirmar una fecha y hora válidas.'
    );
  }

  // 5. Check artist information.
  const artists = Array.isArray(event.artists)
    ? event.artists
    : [];

  if (artists.length === 0) {
    addIssue(
      'missing_artists',
      'warning',
      'No se identificaron artistas.'
    );
  }

  const mainArtist = artists.find(
    artist => artist.role === 'principal'
  );

  // Detect spelling differences such as IFE vs IFÉ.
  // Do not automatically rewrite the event title.
  if (
    mainArtist?.name &&
    event.title &&
    event.title.trim() !== mainArtist.name.trim() &&
    comparableName(event.title) ===
      comparableName(mainArtist.name)
  ) {
    addIssue(
      'title_artist_spelling',
      'warning',
      `Revisar escritura: título "${event.title}" y artista "${mainArtist.name}".`
    );
  }

  // Compare spelling with the original caption, not just Gemini output.
  const captionTitle = findCaptionSpelling(
    event.title,
    data.source_text
  );

  if (captionTitle) {
    addIssue(
      'title_caption_spelling',
      'warning',
      `Título "${event.title}" aparece como "${captionTitle}" en el caption.`
    );
  }

  const captionArtist = findCaptionSpelling(
    mainArtist?.name,
    data.source_text
  );

  if (captionArtist) {
    addIssue(
      'main_artist_caption_spelling',
      'warning',
      `Artista "${mainArtist.name}" aparece como "${captionArtist}" en el caption.`
    );
  }

  // 6. Detect unresolved source conflicts.
  const conflicts = Array.isArray(data.conflicts)
    ? data.conflicts
    : [];

  if (conflicts.length > 0) {
    addIssue(
      'source_conflicts',
      'error',
      'Existen contradicciones entre las fuentes.'
    );
  }

  // 7. Flag municipality without supporting evidence.
  const evidence = Array.isArray(data.field_evidence)
    ? data.field_evidence
    : [];

  if (
    event.municipality &&
    !evidence.some(item => item.field === 'municipality') &&
    data.location_check?.status !== 'matched'
  ) {
    addIssue(
      'municipality_unverified',
      'warning',
      'El municipio necesita verificación adicional.'
    );
  }

  if (data.location_check?.status === 'conflict') {
    addIssue(
      'venue_location_conflict',
      'error',
      'La ubicación extraída contradice la ubicación registrada del local.'
    );
  } else if (data.location_check?.status === 'venue_not_found') {
    addIssue(
      'venue_location_unverified',
      'warning',
      'El local todavía no tiene una ubicación verificada.'
    );
  }

  return {
    basic_checks_passed: !issues.some(
      issue => issue.severity === 'error'
    ),
    issues,
    review_required: true,
    safe_to_publish: false
  };
}

module.exports = { validateEvent };
