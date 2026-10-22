// Pa'l Jangueo - Venue event adapter
// Converts venue details into the shared review format.
// Read-only. Never saves or publishes events.

const {
  prepareDiscoveredEvent
} = require('../utils/prepareDiscoveredEvent');

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

function convertEnglishDate(value) {
  const match = String(value || '').trim().match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/
  );

  if (!match) return null;

  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (!month || year < 2000 || year > 2100) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  // Reject impossible dates such as February 30.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function adaptVenueEvent(details) {
  if (!details || typeof details !== 'object') {
    throw new Error('Faltan los datos del evento.');
  }

  const sourceUrl = new URL(details.url);

  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.hostname !== 'www.cocacolamusichall.com' ||
    !sourceUrl.pathname.startsWith('/events/detail/')
  ) {
    throw new Error('URL del venue no válida.');
  }

  const dateText = convertEnglishDate(details.date);

  if (!dateText || !details.time) {
    throw new Error('Fecha u hora no confirmada.');
  }

  const result = prepareDiscoveredEvent({
    sourceName: 'Coca-Cola Music Hall',
    sourceUrl: sourceUrl.href,
    event: {
      title: details.title,
      is_music_event: false,
      artists: [],
      venue: 'Coca-Cola Music Hall',
      date_text: dateText,
      time_text: details.time,
      price_text: null
    }
  });

  result.source.kind = 'venue';
  result.event.local_music_confirmed = false;

  // Venue pages still require music classification.
  result.validation.review_required = true;
  result.validation.safe_to_publish = false;

  result.warnings.push(
    'Confirmar que es música y que pertenece a la escena local.'
  );

  return result;
}

module.exports = {
  convertEnglishDate,
  adaptVenueEvent
};
