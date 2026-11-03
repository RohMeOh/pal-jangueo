const { extractEventJsonLd } = require('./extractEventJsonLd');

function reconcileBoleteraDate(raw, ticketHtml, apiItem) {
  const address = new URL(raw.source_url);
  if (
    address.protocol !== 'https:' ||
    address.hostname !== 'boletos.boletera.net' ||
    address.username || address.password || address.port ||
    address.search || address.hash ||
    !/^\/e\/[^/]+$/.test(address.pathname) ||
    raw.ticket_url !== raw.source_url + '/tickets' ||
    raw.event_type !== 'MusicEvent' ||
    apiItem?.event_url !== raw.source_url ||
    !apiItem.api_record ||
    apiItem.api_invalid_dates ||
    apiItem.api_dates?.length !== 1
  ) throw new Error('Fuente o función API no verificable.');

  const checkout = extractEventJsonLd(ticketHtml, raw.source_url);
  if (
    checkout.length !== 1 ||
    JSON.stringify(checkout[0]) !== JSON.stringify(raw)
  ) throw new Error('La ficha y la compra difieren.');

  const text = ticketHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ');

  const matches = [...text.matchAll(
    /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi
  )];

  if (!matches.length) throw new Error('Fecha visible de compra ausente.');

  const months = ['jan','feb','mar','apr','may','jun',
    'jul','aug','sep','oct','nov','dec'];
  const days = ['sun','mon','tue','wed','thu','fri','sat'];

  const dates = matches.map(match => {
    const [, weekday, month, day, year, hour, minute, period] = match;
    if (+hour < 1 || +hour > 12 || +minute > 59) {
      throw new Error('Hora visible inválida.');
    }
    const h = (+hour % 12) + (period.toLowerCase() === 'pm' ? 12 : 0);
    const local = `${year}-${String(months.indexOf(month.toLowerCase()) + 1).padStart(2,'0')}-${day.padStart(2,'0')}T${String(h).padStart(2,'0')}:${minute}:00`;
    const calendar = new Date(local + 'Z');
    if (
      !Number.isFinite(+calendar) ||
      calendar.toISOString().slice(0,19) !== local ||
      days[calendar.getUTCDay()] !== weekday.toLowerCase()
    ) throw new Error('Día o fecha visible contradictorios.');
    return new Date(local + '-04:00').toISOString();
  });

  const unique = [...new Set(dates)];
  const official = new Date(raw.start_date || '');
  if (
    unique.length !== 1 ||
    !Number.isFinite(+official) ||
    official.toISOString() !== unique[0]
  ) throw new Error('La fecha visible no coincide con el JSON-LD.');

  return {
    method: 'official_event_and_visible_checkout_date',
    selected_start_at: unique[0],
    api_dates: apiItem.api_dates,
    api_conflict: apiItem.api_dates[0] !== unique[0],
    source_url: raw.source_url,
    checkout_url: raw.ticket_url
  };
}

module.exports = { reconcileBoleteraDate };
