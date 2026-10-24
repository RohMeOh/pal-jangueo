// Pa'l Jangueo - PRticket discovery and poster extraction.
// Read-only. Does not save, approve or publish events.

const BASE = 'https://boletos.prticket.com';
const LIST_URL = `${BASE}/events/es/eventList`;

function attribute(tag, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`,
    'i'
  );
  return tag.match(pattern)?.[2] || null;
}

function decode(text) {
  const entities = {
    amp: '&', quot: '"', apos: "'",
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    nbsp: ' ', ntilde: 'ñ', Ntilde: 'Ñ',
    aacute: 'á', eacute: 'é',
    iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É',
    Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú'
  };

  return String(text || '').replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, entity) => {
      if (entity.startsWith('#')) {
        const hex = /^#x/i.test(entity);
        const value = parseInt(
          entity.slice(hex ? 2 : 1),
          hex ? 16 : 10
        );
        return Number.isFinite(value) &&
          value <= 0x10ffff
          ? String.fromCodePoint(value)
          : whole;
      }
      return entities[entity] ?? whole;
    }
  );
}

function safeHttps(value, hostname) {
  try {
    const url = new URL(value, BASE);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (hostname && url.hostname !== hostname)
    ) return null;

    return url.href;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'text/html' }
  });

  if (
    !response.ok ||
    new URL(response.url).hostname !== 'boletos.prticket.com'
  ) {
    throw new Error(`PRticket: HTTP ${response.status}`);
  }

  return response.text();
}

function extractCards(html) {
  const results = new Map();

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    const label = decode(attribute(tag, 'title'));

    if (!/^Comprar boleto\s+/i.test(label)) continue;

    const href = safeHttps(
      attribute(tag, 'href'),
      'boletos.prticket.com'
    );

    if (!href) continue;

    const url = new URL(href);

    if (!/^\/events\/es\/[a-z0-9_-]+\/?$/i.test(url.pathname)) {
      continue;
    }

    const closing = html.indexOf('</a>', match.index);

    if (closing < 0) continue;

    const section = html.slice(match.index, closing);
    const imgTag = section.match(/<img\b[^>]*>/i)?.[0];

    const banner = imgTag
      ? safeHttps(attribute(imgTag, 'src'))
      : null;

    results.set(url.href, {
      title: label.replace(/^Comprar boleto\s+/i, '').trim(),
      source_url: url.href,
      banner_url: banner
    });
  }

  return [...results.values()];
}

function findMeta(html, propertyName) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];

    if (
      attribute(tag, 'property') === propertyName ||
      attribute(tag, 'name') === propertyName
    ) {
      return decode(attribute(tag, 'content'));
    }
  }

  return null;
}

function extractDetail(html) {
  const text = decode(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ');

  // Official listings can omit the weekday; require a labelled date
  // before accepting an unlabelled Spanish date to avoid picking up
  // arbitrary years mentioned in descriptions.
  const labelledDateMatch = text.match(
    /(?:🗓️?|📅|fecha\s*:)\s*((?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,?\s*)?\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2})/i
  );
  const labelled = labelledDateMatch?.[1] || null;

  const weekdayDate = text.match(
    /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,?\s*\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2}/i
  )?.[0] || null;

  const date = labelled || weekdayDate;

  // PRticket may write 4:30 PM, 4:30 p.m. or 4:30 p. m.
  // This only normalizes the provider's time representation; it does
  // not bypass event/date/venue/music verification.
  const time = text.match(
    /\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*[ap]\.?\s*m\.?(?![a-z])/i
  )?.[0] || null;

  const pageTitle = findMeta(html, 'og:title');
  const separator = pageTitle?.lastIndexOf(' - ') ?? -1;

  const eventTitle = separator >= 0
    ? pageTitle.slice(0, separator).trim()
    : null;

  // A date mentioned inside the event prose is not the end of its
  // description. Prefer the explicit date label as the boundary; this
  // also keeps pricing and site-wide legal text out of the evidence.
  const descriptionEnd = labelledDateMatch
    ? labelledDateMatch.index
    : date ? text.indexOf(date) : -1;

  const beforeDate = descriptionEnd >= 0
    ? text.slice(0, descriptionEnd)
    : '';

  const titlePosition = eventTitle
    ? beforeDate.toLocaleLowerCase('es')
        .lastIndexOf(eventTitle.toLocaleLowerCase('es'))
    : -1;

  const bodyDescription = titlePosition >= 0
    ? beforeDate
        .slice(titlePosition + eventTitle.length)
        .trim()
        .slice(0, 1800)
    : '';

  return {
    page_title: pageTitle,
    poster_url: safeHttps(findMeta(html, 'og:image')),
    description_evidence:
      findMeta(html, 'og:description') ||
      findMeta(html, 'description') ||
      (bodyDescription.length >= 40 ? bodyDescription : null),
    date_evidence: date,
    time_evidence: time
  };
}

async function main() {
  console.log('\n=== PRTICKET: EVENTOS REALES ===');
  console.log('Modo: SOLO LECTURA');

  const html = await fetchHtml(LIST_URL);
  const cards = extractCards(html);

  console.log('Tarjetas de eventos:', cards.length);

  if (cards.length === 0) {
    throw new Error('No se detectaron tarjetas de eventos.');
  }

  for (const card of cards.slice(0, 12)) {
    console.log('\nEvento:', card.title);
    console.log('URL:', card.source_url);
    console.log('Banner:', card.banner_url || 'No disponible');
  }

  console.log('\n=== PRUEBA DE POSTERS Y FECHAS ===');

  const slugs = [
    'y2komeback',
    'boleros-baladas',
    'cantaresdenavidad',
    'blancotemblor'
  ];

  for (const slug of slugs) {
    const card = cards.find(
      item => new URL(item.source_url)
        .pathname.endsWith('/' + slug)
    );

    if (!card) {
      console.log('\nNo encontrado:', slug);
      continue;
    }

    try {
      const detail = extractDetail(
        await fetchHtml(card.source_url)
      );

      console.log('\nEvento:', card.title);
      console.log('Título página:', detail.page_title);
      console.log('Poster:', detail.poster_url || 'Pendiente');
      console.log('Fecha detectada:', detail.date_evidence || 'Pendiente');
      console.log('Hora detectada:', detail.time_evidence || 'Pendiente');
    } catch (error) {
      console.log('\nEvento:', card.title);
      console.log('Detalle no disponible:', error.message);
    }
  }

  console.log('\nCandidatos guardados: 0');
  console.log('Eventos aprobados: 0');
  console.log('Eventos publicados: 0');
}

if (require.main === module) {
  main().catch(error => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  LIST_URL,
  fetchHtml,
  extractCards,
  extractDetail
};
