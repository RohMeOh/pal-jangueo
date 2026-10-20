// Pa'l Jangueo - Event data normalization

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4,
  mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
};

// Convert times to 24-hour HH:mm format
function normalizeTime(value) {
  if (!value) return null;

  const text = String(value)
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '');

  const twelveHour = text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);

  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || 0);
    const period = twelveHour[3];

    if (hour < 1 || hour > 12 || minute > 59) {
      return null;
    }

    if (period === 'am' && hour === 12) hour = 0;
    if (period === 'pm' && hour !== 12) hour += 12;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const twentyFourHour = text.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);

    if (hour > 23 || minute > 59) return null;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  return null;
}

// Convert dates to YYYY-MM-DD without guessing ambiguous formats
function normalizeDate(value) {
  if (!value) return null;

  const text = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let year, month, day;

  // Format: 2026-10-23
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    // Format: 23 de octubre de 2026
    const spanish = text.match(
      /\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})\b/
    );

    if (spanish) {
      day = Number(spanish[1]);
      month = MONTHS[spanish[2]];
      year = Number(spanish[3]);
    } else {
      // Formats: 10/23/26 or 23/10/26
      const numeric = text.match(
        /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/
      );

      if (!numeric) return null;

      const first = Number(numeric[1]);
      const second = Number(numeric[2]);
      const yearText = numeric[3];

      // Two-digit years are interpreted as 20xx.
      year = yearText.length === 2
        ? 2000 + Number(yearText)
        : Number(yearText);

      if (
        first >= 1 && first <= 12 &&
        second >= 13 && second <= 31
      ) {
        // Unambiguous MM/DD/YY
        month = first;
        day = second;
      } else if (
        first >= 13 && first <= 31 &&
        second >= 1 && second <= 12
      ) {
        // Unambiguous DD/MM/YY
        day = first;
        month = second;
      } else if (
        first === second &&
        first >= 1 && first <= 12
      ) {
        // Same month and day in either format
        month = first;
        day = second;
      } else {
        // Ambiguous or invalid numeric date
        return null;
      }
    }
  }

  if (!month || year < 2000 || year > 2100) {
    return null;
  }

  // Reject impossible dates such as February 30.
  const date = new Date(Date.UTC(year, month - 1, day));

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

// Convert prices to PostgreSQL-compatible numeric fields
function normalizePrice(value) {
  const unknown = {
    price_type: 'unknown',
    price_min: null,
    price_max: null
  };

  if (!value) return unknown;

  const text = String(value).toLowerCase();

  const free = /\b(gratis|gratuito|gratuita|free|entrada libre)\b/.test(text);

  const amounts = [
    ...text.matchAll(/(?:\$|usd\s*)(\d+(?:,\d{3})*(?:\.\d{1,2})?)/gi)
  ].map(match => Number(match[1].replace(/,/g, '')));

  if (amounts.length === 0) {
    for (const match of text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:dolares|dólares)/gi)) {
      amounts.push(Number(match[1].replace(',', '.')));
    }
  }

  if (free && amounts.length === 0) {
    return {
      price_type: 'free',
      price_min: 0,
      price_max: 0
    };
  }

  if (free && amounts.length > 0) return unknown;
  if (amounts.length === 0) return unknown;
  if (amounts.some(n => !Number.isFinite(n) || n < 0)) return unknown;

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);

  if (min === 0 && max === 0) {
    return {
      price_type: 'free',
      price_min: 0,
      price_max: 0
    };
  }

  if (amounts.length === 1 && /\b(desde|starting at|from)\b/.test(text)) {
    return { price_type: 'paid', price_min: min, price_max: null };
  }

  if (amounts.length === 1 && /\b(hasta|up to)\b/.test(text)) {
    return { price_type: 'paid', price_min: null, price_max: max };
  }

  return {
    price_type: 'paid',
    price_min: min,
    price_max: max
  };
}

function normalizeEvent(event) {
  const date = normalizeDate(event.date_text);
  const time = normalizeTime(event.time_text);
  const price = normalizePrice(event.price_text);

  // Puerto Rico uses UTC-04:00 year-round.
  const startAt = date && time
    ? new Date(`${date}T${time}:00-04:00`).toISOString()
    : null;

  return {
    original: {
      date_text: event.date_text ?? null,
      time_text: event.time_text ?? null,
      price_text: event.price_text ?? null
    },
    normalized: {
      date,
      time,
      start_at: startAt,
      ...price
    },
    review_required: true,
    ready_for_date_validation: Boolean(startAt)
  };
}

module.exports = {
  normalizeTime,
  normalizeDate,
  normalizePrice,
  normalizeEvent
};
