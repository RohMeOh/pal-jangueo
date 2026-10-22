// Pa'l Jangueo - Prepare Boletera events for review

function normalizeBoleteraCandidate(event, now = new Date()) {
  if (event?.event_type !== 'MusicEvent') {
    throw new Error('El registro no es MusicEvent.');
  }

  const date = event.start_date
    ? new Date(event.start_date)
    : null;

  const validDate = date && !Number.isNaN(date.getTime());
  const startAt = validDate ? date.toISOString() : null;
  const isUpcoming = validDate ? date > now : false;

  const status = String(event.event_status || '')
    .split('/')
    .pop();

  const isScheduled = status === 'EventScheduled';

  const offers = Array.isArray(event.offers)
    ? event.offers
    : [];

  const prices = offers
    .filter(offer =>
      typeof offer.price === 'number' &&
      Number.isFinite(offer.price) &&
      offer.price >= 0 &&
      (!offer.currency || offer.currency === 'USD')
    )
    .map(offer => offer.price);

  const hasPaidTickets = prices.some(price => price > 0);

  const priceType = hasPaidTickets
    ? 'paid'
    : prices.length > 0
      ? 'free'
      : 'unknown';

  const reviewReasons = [
    'Confirmar relevancia para la escena musical local.',
    'Verificar precios y disponibilidad antes de publicar.'
  ];

  if (!validDate) {
    reviewReasons.push('Falta una fecha válida.');
  } else if (!isUpcoming) {
    reviewReasons.push('El evento ya pasó.');
  }

  if (!isScheduled) {
    reviewReasons.push('Confirmar estado del evento.');
  }

  if (!event.venue?.name) {
    reviewReasons.push('Falta el nombre del local.');
  }

  return {
    source_name: 'Boletera',
    source_url: event.source_url || null,
    title: event.name || null,
    start_at: startAt,
    event_status: status || null,

    venue: event.venue?.name || null,
    venue_address: event.venue?.street_address || null,
    municipality: event.venue?.municipality || null,

    ticket_url: event.ticket_url || null,
    price_type: priceType,
    price_min: prices.length ? Math.min(...prices) : null,
    price_max: prices.length ? Math.max(...prices) : null,

    is_music_event: true,
    local_music_confirmed: false,
    is_upcoming: isUpcoming,
    eligible_for_feed: Boolean(isUpcoming && isScheduled),
    review_status: 'pending_review',
    safe_to_publish: false,
    review_reasons: reviewReasons
  };
}

module.exports = { normalizeBoleteraCandidate };
