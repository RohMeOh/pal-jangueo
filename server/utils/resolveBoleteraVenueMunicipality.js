'use strict';

// Verified exact venue/address fallback. Never guess from a venue name alone.
// Reference: discoverpuertorico.com/es/profile/
// centro-de-convenciones-de-barceloneta/16304

function resolveBoleteraVenueMunicipality(event) {
  const official = String(event?.venue?.municipality || '').trim();

  let trusted = false;
  try {
    const url = new URL(event.source_url);
    trusted =
      url.origin === 'https://boletos.boletera.net' &&
      !url.username &&
      !url.password &&
      /^\/e\/[^/]+\/?$/.test(url.pathname) &&
      event.event_type === 'MusicEvent';
  } catch {
    // No trusted source.
  }

  const verifiedVenue =
    trusted &&
    event?.venue?.name?.trim().toLowerCase() ===
      'centro de convenciones de barceloneta' &&
    event?.venue?.street_address?.trim().toLowerCase() ===
      'puerto rico 681' &&
    String(event?.venue?.postal_code || '').trim() === '00617';

  if (verifiedVenue && official &&
      official.toLowerCase() !== 'barceloneta') {
    throw new Error('Municipio oficial contradictorio.');
  }

  if (official) return official;

  return verifiedVenue ? 'Barceloneta' : null;
}

module.exports = { resolveBoleteraVenueMunicipality };
