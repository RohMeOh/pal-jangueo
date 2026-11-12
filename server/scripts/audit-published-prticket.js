'use strict';

// Read-only monitoring of future published PRticket events.
// Never modifies approved events or candidate decisions.

const fs = require('node:fs');
const pool = require('../db');

const {
  LIST_URL,
  fetchHtml,
  extractCards,
  extractDetail
} = require('./discover-prticket');

const {
  comparePublishedPrticket
} = require('../utils/auditPublishedPrticket');

function authorizedUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'boletos.prticket.com' &&
      /^\/events\/es\/[a-z0-9_-]+\/?$/i.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function auditWarning(title, issues) {
  const relevant = issues.filter(issue =>
    issue !== 'FUNCIONES_MULTIPLES_REVISAR_FECHAS'
  );

  if (!relevant.length) return false;

  const safeTitle = String(title)
    .replace(/[\r\n:]/g, ' ')
    .slice(0, 90);

  console.log(
    `::warning::PRticket: ${safeTitle}: ${relevant.join(', ')}`
  );

  return true;
}

function writeSummary(results, warnings) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;

  const safe = value =>
    String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/[\r\n]/g, ' ');

  const lines = [
    '## PRticket - Published events audit',
    '',
    `Sources checked: ${results.length}`,
    `Sources requiring review: ${warnings}`,
    '',
    '| Event | Performances | Result |',
    '|---|---:|---|',
    ...results.map(item =>
      `| ${safe(item.title)} | ${item.performances} | ` +
      `${safe(item.issues.join(', ') || 'SIN_CAMBIOS')} |`
    ),
    '',
    'Read-only audit. No events were modified.',
    ''
  ];

  fs.appendFileSync(file, lines.join('\n') + '\n');
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('Uso: node scripts/audit-published-prticket.js');
  }

  console.log('\n=== AUDITORÍA PRTICKET ===');
  console.log('Modo: SOLO LECTURA');

  try {
    const { rows } = await pool.query(`
      SELECT
        e.id,
        e.title,
        e.description,
        e.start_at,
        v.name AS venue,
        es.source_url
      FROM public.events e
      JOIN public.event_sources es
        ON es.event_id = e.id
      JOIN public.venues v
        ON v.id = e.venue_id
      WHERE e.is_published = TRUE
        AND e.status = 'scheduled'
        AND e.start_at > NOW()
        AND es.source_url LIKE
          'https://boletos.prticket.com/events/es/%'
      ORDER BY e.start_at, e.title
    `);

    if (rows.length > 200) {
      throw new Error('Volumen inesperado de eventos publicados.');
    }

    const cards = extractCards(await fetchHtml(LIST_URL));

    if (!cards.length) {
      throw new Error('El catálogo oficial está vacío.');
    }

    const catalog = new Map(
      cards.map(card => [card.source_url, card])
    );

    const grouped = new Map();

    for (const event of rows) {
      if (!grouped.has(event.source_url)) {
        grouped.set(event.source_url, []);
      }

      grouped.get(event.source_url).push(event);
    }

    const results = [];
    let warnings = 0;

    for (const [url, events] of grouped) {
      const issues = [];

      if (!authorizedUrl(url)) {
        issues.push('URL_NO_AUTORIZADA');
      } else {
        const card = catalog.get(url);

        if (!card) {
          issues.push('FUENTE_NO_LISTADA');
        }

        try {
          const html = await fetchHtml(url);
          const detail = extractDetail(html);

          const comparison = comparePublishedPrticket(
            events,
            card || {
              title: events[0].title,
              source_url: url
            },
            detail
          );

          issues.push(...comparison);
        } catch (error) {
          issues.push('DETALLE_NO_DISPONIBLE');
          console.error('Detalle:', url, error.message);
        }
      }

      if (auditWarning(events[0].title, issues)) {
        warnings++;
      }

      results.push({
        title: events[0].title,
        performances: events.length,
        issues
      });
    }

    console.table(results.map(item => ({
      evento: item.title,
      funciones: item.performances,
      resultado: item.issues.join(', ') || 'SIN_CAMBIOS'
    })));

    const functions = results.reduce(
      (sum, item) => sum + item.performances, 0
    );

    console.log('\nFuentes revisadas:', results.length);
    console.log('Funciones publicadas revisadas:', functions);
    console.log('Fuentes con advertencias:', warnings);
    console.log('Cambios realizados: 0');

    writeSummary(results, warnings);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
