// Ticket Center PR discovery. Read-only: never saves or publishes.
const { assessMusicEvidence } = require('../utils/assessMusicEvidence');
const BASE = 'https://tcpr.com/';
const LIST_URLS = [BASE, `${BASE}categories/music`, `${BASE}categories/concerts/2`];
function decode(value) {
  const entities = { amp: '&', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ' };
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
    if (!key.startsWith('#')) return entities[key] ?? whole;
    const hex = /^#x/i.test(key);
    const n = parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
  });
}
function attr(tag, name) {
  return decode(tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'is'))?.[2]);
}
function text(html) {
  return decode(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function safeUrl(value) {
  try {
    const u = new URL(decode(value), BASE);
    if (u.protocol !== 'https:' || u.hostname !== 'tcpr.com' || u.port || u.username || u.password) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
// Read one balanced div, rather than truncating nested descriptions.
function divContent(html, className) {
  const tags = /<\/?div\b[^>]*>/gi;
  let match, start = null, depth = 0;
  while ((match = tags.exec(html))) {
    const closing = /^<\//.test(match[0]);
    if (start === null) {
      if (!closing && attr(match[0], 'class').split(/\s+/).includes(className)) { start = tags.lastIndex; depth = 1; }
    } else {
      depth += closing ? -1 : 1;
      if (!depth) return html.slice(start, match.index);
    }
  }
  return '';
}
function performance(url) {
  const u = safeUrl(url);
  if (!u) return null;
  const m = new URL(u).pathname.match(/^\/(?:es-PR\/)?events\/([^/]+)\/(\d{4})-(\d{1,2})-(\d{1,2})_(\d{1,2})\.(\d{2})\/([^/]+)\/?$/i);
  if (!m) return null;
  const [, , y, mo, d, h, mi] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  const local = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi}:00`;
  const date = new Date(`${local}Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0,19) !== local) return null;
  return { ticket_url: u, start_at: new Date(`${local}-04:00`).toISOString(), timezone: 'America/Puerto_Rico' };
}
function extractCards(html) {
  const starts = [...html.matchAll(/<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bdataItem\b[^"']*\1[^>]*>/gi)];
  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const tag = starts[i][0];
    const block = html.slice(starts[i].index, starts[i+1]?.index ?? html.length);
    const title = attr(tag, 'data-name');
    const links = [...block.matchAll(/<a\b[^>]*>/gi)].flatMap(m => [attr(m[0], 'href'), attr(m[0], 'data-clickEvent')]).filter(Boolean).map(safeUrl).filter(Boolean);
    const show = links.find(u => /^\/(?:es-PR\/)?shows\/[^/]+\/(?:events(?:\/\d+)?|info)\/?$/i.test(new URL(u).pathname));
    if (!title || !show) continue;
    const source_url = show.replace(/\/(?:events(?:\/\d+)?|info)\/?$/i, '/info');
    const description = text(divContent(block, 'description'));
    const performances = [...new Map(links.map(performance).filter(Boolean).map(p => [p.ticket_url,p])).values()];
    cards.push({ source_name: 'Ticket Center PR', source_url, listing_url: show, title, description,
      venue: text(divContent(block, 'hall')) || null,
      performances, music: assessMusicEvidence(`${title}. ${description}`),
      review_required: true, safe_to_publish: false });
  }
  return cards;
}
function mergeCards(groups) {
  const merged = new Map();
  for (const card of groups.flat()) {
    const previous = merged.get(card.source_url);
    if (!previous) { merged.set(card.source_url, { ...card, performances: [...card.performances] }); continue; }
    if (!previous.venue && card.venue) previous.venue = card.venue;
    if (card.description.length > previous.description.length) {
      previous.description = card.description;
      previous.music = card.music;
    }
    previous.performances = [...new Map([...previous.performances, ...card.performances].map(p => [p.ticket_url,p])).values()];
    if (previous.title !== card.title || (previous.venue && card.venue && previous.venue !== card.venue)) previous.source_conflict = true;
  }
  return [...merged.values()];
}
async function fetchHtml(url) {
  if (!safeUrl(url)) throw new Error('Ticket Center: URL no autorizada');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/html' } });
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error(`Ticket Center: HTTP ${response.status} o contenido no HTML`);
  const html = await response.text();
  if (/client challenge|verify you are human|cf-chl-/i.test(html)) throw new Error('Ticket Center: acceso restringido');
  return html;
}
async function main() {
  if (process.argv.slice(2).some(arg => !['--json', '--details'].includes(arg))) throw new Error('Uso: node scripts/discover-ticketcenter.js [--json] [--details]');
  const groups = [];
  for (const url of LIST_URLS) {
    const cards = extractCards(await fetchHtml(url));
    if (!cards.length) throw new Error(`Catálogo vacío o estructura cambiada: ${url}`);
    groups.push(cards);
  }
  const cards = mergeCards(groups);
  const detailErrors = [];
  if (process.argv.includes('--details')) {
    for (const card of cards) {
      try {
      const html = await fetchHtml(
        card.listing_url &&
        /\/events(?:\/\d+)?\/?$/i.test(new URL(card.listing_url).pathname)
          ? card.listing_url
          : card.source_url.replace(/\/info$/, '/events')
      );
      const start = html.search(/<div\b[^>]*\bid=["']eventslist["']/i);
      const end = html.indexOf('<div id="media"', start);
      if (start < 0 || end < 0) throw new Error(`No se encontró la lista de funciones: ${card.source_url}`);
      const block = html.slice(start, end);
      const found = [...block.matchAll(/<a\b[^>]*>/gi)].flatMap(m =>
        [attr(m[0], 'href'), attr(m[0], 'data-clickEvent')]
      ).filter(Boolean).map(performance).filter(Boolean);
      card.performances = [...new Map([...card.performances, ...found].map(p => [p.ticket_url,p])).values()];
      card.description = text(divContent(html, 'brief')) || card.description;
      card.music = assessMusicEvidence(`${card.title}. ${card.description}`);
      card.detail_checked = true;
      console.error(`Funciones: ${card.performances.length} | ${card.title}`);
      } catch (error) {
        card.detail_checked = false;
        detailErrors.push({
          title: card.title,
          source_url: card.source_url,
          error: error.message
        });
        console.error(`PENDIENTE: ${card.title} | ${error.message}`);
      }
    }
  }
  for (const card of cards) {
    const names = [];
    for (const item of card.performances) {
      try {
        item.venue_name = decodeURIComponent(new URL(item.ticket_url).pathname.split('/').filter(Boolean).pop());
        item.venue_verified = false;
        names.push(item.venue_name);
      } catch { item.venue_name = null; }
    }
    card.venue_names = [...new Set(names)];
    card.venue = card.venue_names.length === 1 ? card.venue_names[0] : card.venue;
    card.venue_verified = false;
  }
  const now = Date.now();
  const result = { source: 'Ticket Center PR', mode: 'preview', listing_urls: LIST_URLS,
    coverage: 'Homepage, Music and Concerts listings only; full performance and category coverage not yet certified',
    shows: cards.length, upcoming_performances: cards.flatMap(c => c.performances).filter(p => Date.parse(p.start_at) > now).length,
    detail_errors: detailErrors,
    details_complete: process.argv.includes('--details') && detailErrors.length === 0,
    saved: 0, published: 0, events: cards };
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { decode, safeUrl, performance, extractCards, mergeCards, fetchHtml, LIST_URLS };
