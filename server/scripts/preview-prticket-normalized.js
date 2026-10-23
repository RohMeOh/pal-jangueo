const {
  LIST_URL,
  fetchHtml,
  extractCards,
  extractDetail
} = require('./discover-prticket');

const {
  normalizePrticketEvent
} = require('../utils/normalizePrticketEvent');

const SLUGS = [
  'y2komeback',
  'boleros-baladas',
  'cantaresdenavidad',
  'blancotemblor'
];

async function main() {
  const listing = await fetchHtml(LIST_URL);
  const cards = extractCards(listing);

  console.log('\n=== PRTICKET: NORMALIZACIÓN ===');
  console.log('Tarjetas descubiertas:', cards.length);

  let complete = 0;
  let pending = 0;

  for (const slug of SLUGS) {
    const card = cards.find(item =>
      new URL(item.source_url)
        .pathname.endsWith('/' + slug)
    );

    if (!card) {
      console.log('\nNo encontrado:', slug);
      pending++;
      continue;
    }

    try {
      const html = await fetchHtml(card.source_url);
      const detail = extractDetail(html);
      const event = normalizePrticketEvent(card, detail);

      console.log('\n-------------------------');
      console.log('Título:', event.title);
      console.log('Venue:', event.venue || 'Pendiente');
      console.log('Fecha UTC:', event.start_at || 'Pendiente');
      console.log('Poster:', event.poster_url || 'Pendiente');
      console.log('Estado:', event.status);
      console.log('Publicación automática:', 'NO');

      if (event.status === 'structured_data_ready') {
        complete++;
      } else {
        pending++;
      }
    } catch (error) {
      console.log('\nError en:', slug, error.message);
      pending++;
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Datos estructurados completos:', complete);
  console.log('Necesitan más información:', pending);
  console.log('Candidatos guardados: 0');
  console.log('Eventos publicados: 0');
}

main().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
