// Pa'l Jangueo - Boletera adapter
// Converts Boletera data into our shared review format.
// Does not save or publish events.

const {
  prepareDiscoveredEvent
} = require('../utils/prepareDiscoveredEvent');

function localDateTime(value) {
  if (
    typeof value !== 'string' ||
    !/(Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    throw new Error('La fecha necesita una zona horaria explícita.');
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error('Fecha de evento no válida.');
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Puerto_Rico',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return {
    dateText: `${parts.year}-${parts.month}-${parts.day}`,
    timeText: `${parts.hour}:${parts.minute}`
  };
}

function getPriceText(offers) {
  const prices = (Array.isArray(offers) ? offers : [])
    .filter(offer =>
      typeof offer.price === 'number' &&
      Number.isFinite(offer.price) &&
      offer.price >= 0 &&
      (!offer.currency || offer.currency === 'USD')
    )
    .map(offer => offer.price);

  if (!prices.length) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Do not guess how mixed free/paid offers work.
  if (min === 0 && max > 0) return null;

  if (max === 0) return 'Gratis';

  return min === max
    ? `$${min}`
    : `$${min} - $${max}`;
}


const {
  resolveBoleteraVenueMunicipality
} = require('../utils/resolveBoleteraVenueMunicipality');

function adaptBoleteraEvent(rawEvent) {
  if (rawEvent?.event_type !== 'MusicEvent') {
    throw new Error('La fuente no identifica un MusicEvent.');
  }

  const url = new URL(rawEvent.source_url);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'boletos.boletera.net'
  ) {
    throw new Error('Fuente de Boletera no válida.');
  }

  const { dateText, timeText } =
    localDateTime(rawEvent.start_date);

  const result = prepareDiscoveredEvent({
    sourceName: 'Boletera',
    sourceUrl: url.href,
    sourceText:
      typeof rawEvent.description_raw === 'string'
        ? rawEvent.description_raw
        : '',
    event: {
      title: rawEvent.name,
      is_music_event: true,
      artists: [],
      venue: rawEvent.venue?.name,
      municipality: resolveBoleteraVenueMunicipality(rawEvent),
      date_text: dateText,
      time_text: timeText,
      price_text: getPriceText(rawEvent.offers)
    }
  });

  const eventStatus = String(rawEvent.event_status || '')
    .split('/')
    .pop();

  if (eventStatus !== 'EventScheduled') {
    result.validation.issues.push({
      code: 'event_status_unverified',
      severity: 'error',
      message: 'El evento no está confirmado como programado.'
    });

    result.validation.basic_checks_passed = false;
  }

  result.source.kind = 'ticketing';
  result.event.ticket_url = rawEvent.ticket_url || null;
  result.event.event_status = eventStatus;
  result.event.local_music_confirmed = false;

  return result;
}

module.exports = { adaptBoleteraEvent };
