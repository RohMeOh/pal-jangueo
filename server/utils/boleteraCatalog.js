const { extractEvents } = require('../scripts/discover-boletera');

function canonical(value) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'boletos.boletera.net' ||
      url.username ||
      url.password
    ) return null;

    const path = url.pathname
      .replace(/\/tickets\/?$/, '')
      .replace(/\/$/, '');

    if (!/^\/e\/[^/]+$/.test(path)) return null;

    return url.origin + path;
  } catch {
    return null;
  }
}

function iso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractApiEvents(records) {
  if (!Array.isArray(records)) {
    throw new Error('Formato inesperado de la API Boletera');
  }

  const found = new Map();

  for (const item of records) {
    if (!item || item.status !== 'published') continue;

    const rawDates =
      Array.isArray(item.event_dates) && item.event_dates.length
        ? item.event_dates.map(date => date?.starts_at)
        : item.starts_at ? [item.starts_at] : [];

    const dates = [...new Set(
      rawDates.map(iso).filter(Boolean)
    )].sort();

    const primary = iso(item.starts_at);

    const invalidDates =
      rawDates.some(date => !iso(date)) ||
      (Boolean(item.starts_at) && !primary) ||
      (Boolean(primary) && dates.length > 0 &&
        !dates.includes(primary));

    for (const value of [item.external_url, item.ticket_url]) {
      const url = canonical(value);
      if (!url) continue;

      const previous = found.get(url);

      found.set(url, {
        source: 'Boletera',
        event_url: url,
        ticket_url: url + '/tickets',
        music_status: 'needs_review',
        api_record: true,
        api_title: item.title || previous?.api_title || null,
        api_dates: [...new Set([
          ...(previous?.api_dates || []), ...dates
        ])].sort(),
        api_invalid_dates:
          invalidDates || Boolean(previous?.api_invalid_dates)
      });
    }
  }

  return [...found.values()];
}

function mergeCatalog(homeHtml, apiRecords) {
  const homepage = extractEvents(homeHtml);
  const apiEvents = extractApiEvents(apiRecords);

  const all = new Map(
    homepage.map(item => [
      item.event_url,
      { ...item, api_record: false, api_dates: [] }
    ])
  );

  let outsideHomepage = 0;

  for (const item of apiEvents) {
    const existing = all.get(item.event_url);

    if (!existing) outsideHomepage++;

    all.set(item.event_url, {
      ...item,
      ...(existing || {}),
      ticket_url: existing?.ticket_url || item.ticket_url,
      api_record: true,
      api_title: item.api_title,
      api_dates: item.api_dates,
      api_invalid_dates: item.api_invalid_dates
    });
  }

  return {
    events: [...all.values()],
    homepageCount: homepage.length,
    apiCount: apiEvents.length,
    outsideHomepage
  };
}

function compareDates(officialStart, item) {
  if (!item.api_record) return 'not_in_api';
  if (item.api_invalid_dates) return 'invalid_api_date';

  const dates = item.api_dates || [];

  if (dates.length > 1) return 'multiple_dates';
  if (dates.length === 0) return 'not_provided';

  const official = iso(officialStart);

  if (!official) return 'missing_official_date';

  return official === dates[0] ? 'match' : 'conflict';
}

module.exports = {
  canonical,
  extractApiEvents,
  mergeCatalog,
  compareDates
};
