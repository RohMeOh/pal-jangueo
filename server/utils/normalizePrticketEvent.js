// PRticket extracted event -> Pa'l Jangueo preview format.
// Pure function: no database changes.

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4,
  mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
};

const WEEKDAYS = [
  'domingo', 'lunes', 'martes', 'miercoles',
  'jueves', 'viernes', 'sabado'
];

function plain(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parsePuertoRicoDate(dateText, timeText) {
  const date = plain(dateText).match(
    /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo),?\s*(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(20\d{2})$/
  );

  const time = String(timeText || '').match(
    /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i
  );

  if (!date || !time) return null;

  const [, weekday, dayRaw, monthRaw, yearRaw] = date;
  const day = Number(dayRaw);
  const month = MONTHS[monthRaw];
  const year = Number(yearRaw);

  if (!month) return null;

  const calendar = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    WEEKDAYS[calendar.getUTCDay()] !== weekday
  ) {
    return null;
  }

  const hour12 = Number(time[1]);

  if (hour12 < 1 || hour12 > 12) return null;

  const hour24 =
    (hour12 % 12) + (time[3].toUpperCase() === 'PM' ? 12 : 0);

  // Puerto Rico remains UTC-4 throughout the year.
  const utcHour = Date.UTC(
    year, month - 1, day,
    hour24 + 4, Number(time[2])
  );

  return new Date(utcHour).toISOString();
}

function normalizePrticketEvent(card, detail) {
  const pageTitle = detail.page_title || '';
  const separator = pageTitle.lastIndexOf(' - ');

  const sourceTitle = separator >= 0
    ? pageTitle.slice(0, separator).trim()
    : '';

  const rawVenue = separator >= 0
    ? pageTitle.slice(separator + 3).trim()
    : '';

  const venue =
    rawVenue &&
    plain(rawVenue) !== 'multiple location'
      ? rawVenue
      : null;

  const titleMatches =
    Boolean(sourceTitle) &&
    plain(sourceTitle) === plain(card.title);

  const startAt = parsePuertoRicoDate(
    detail.date_evidence,
    detail.time_evidence
  );

  const future =
    startAt && new Date(startAt) > new Date();

  const structurallyComplete =
    titleMatches &&
    Boolean(venue) &&
    Boolean(future);

  return {
    source_name: 'PRticket',
    source_url: card.source_url,
    title: card.title,
    venue,
    start_at: startAt,
    poster_url: detail.poster_url || card.banner_url || null,
    source_date_text: detail.date_evidence,
    source_time_text: detail.time_evidence,
    status: structurallyComplete
      ? 'structured_data_ready'
      : 'needs_more_info',
    musical_event_verified: false,
    scene_relevance_documented: false,
    safe_to_publish: false
  };
}

module.exports = {
  normalizePrticketEvent,
  parsePuertoRicoDate
};
