const {
  extractPrticketVenueLocation
} = require('./extractPrticketVenueLocation');

function extractPrticketFrontpageVenues(html) {
  const venues = new Map();

  const sections = String(html || '').split(
    /<div\b[^>]*class=["'][^"']*\bitem-wrapper\b[^"']*["'][^>]*>/i
  ).slice(1);

  for (const section of sections) {
    const href = section.match(
      /<a\b[^>]*\bhref=["']([^"']+)["']/i
    )?.[1];

    const venueHtml = section.match(
      /<div\b[^>]*class=["'][^"']*\bvenue\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    )?.[1];

    if (!href || !venueHtml) continue;

    let url;

    try {
      url = new URL(href, 'https://boletos.prticket.com');
    } catch {
      continue;
    }

    if (
      url.origin !== 'https://boletos.prticket.com' ||
      !/^\/events\/es\/[a-z0-9_-]+\/?$/i.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      continue;
    }

    const venueText = venueHtml
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();

    const location = extractPrticketVenueLocation(
      venueText
    );

    if (!location.venue || !location.municipality) {
      continue;
    }

    const key = url.origin + url.pathname.replace(/\/$/, '');

    const existing = venues.get(key);

    if (
      existing &&
      (
        existing.venue !== location.venue ||
        existing.municipality !== location.municipality
      )
    ) {
      venues.delete(key);
      continue;
    }

    venues.set(key, location);
  }

  return venues;
}

module.exports = { extractPrticketFrontpageVenues };
