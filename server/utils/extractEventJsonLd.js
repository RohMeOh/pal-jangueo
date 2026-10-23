// Pa'l Jangueo - Extract structured event data

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getObjects(data) {
  if (Array.isArray(data)) {
    return data.flatMap(getObjects);
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  return [
    data,
    ...getObjects(data['@graph'])
  ];
}

function validUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function extractNamedEntities(value, sourceUrl) {
  return asArray(value)
    .slice(0, 50)
    .map(item => {
      const data = typeof item === 'string'
        ? { name: item }
        : item;

      if (!data || typeof data !== 'object') {
        return null;
      }

      const name = typeof data.name === 'string'
        ? data.name.trim()
        : '';

      if (!name || name.length > 200) {
        return null;
      }

      return {
        name,
        url: validUrl(data.url, sourceUrl)
      };
    })
    .filter(Boolean);
}

function extractEventJsonLd(html, sourceUrl) {
  const events = [];

  const scripts = html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  );

  for (const script of scripts) {
    const attributes = script[1];

    if (!/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attributes)) {
      continue;
    }

    let data;

    try {
      data = JSON.parse(script[2]);
    } catch {
      continue;
    }

    for (const item of getObjects(data)) {
      const types = asArray(item['@type']);

      const isMusicEvent = types.some(type =>
        typeof type === 'string' &&
        type.split('/').pop() === 'MusicEvent'
      );

      if (!isMusicEvent) {
        continue;
      }

      const location = asArray(item.location)[0] || {};
      const address = location.address || {};

      const offers = asArray(item.offers).map(offer => ({
        name: offer.name || null,
        price: Number.isFinite(Number(offer.price))
          && offer.price !== undefined
          && offer.price !== null
          && offer.price !== ''
          ? Number(offer.price)
          : null,
        currency: offer.priceCurrency || null,
        availability: offer.availability || null,
        url: validUrl(offer.url, sourceUrl)
      }));

      const ticketUrl =
        offers.find(offer => offer.url)?.url ||
        validUrl(item.url, sourceUrl);

      const performers = extractNamedEntities(
        item.performer,
        sourceUrl
      );

      const organizers = extractNamedEntities(
        item.organizer,
        sourceUrl
      );

      const eventRecord = {
        source: 'Boletera',
        source_url: sourceUrl,
        event_type: 'MusicEvent',
        name: item.name || null,
        start_date: item.startDate || null,
        event_status: item.eventStatus || null,

        venue: {
          name: location.name || null,
          street_address: address.streetAddress || null,
          municipality: address.addressLocality || null,
          postal_code: address.postalCode || null
        },

        ticket_url: ticketUrl,
        offers,

        description_raw: item.description || null,
        music_status: 'likely_music',
        review_required: true
      };

      // Preserve existing event hashes when these
      // optional structured fields are absent.
      if (performers.length > 0) {
        eventRecord.performers = performers;
      }

      if (organizers.length > 0) {
        eventRecord.organizers = organizers;
      }

      events.push(eventRecord);
    }
  }

  return events;
}

module.exports = { extractEventJsonLd };
