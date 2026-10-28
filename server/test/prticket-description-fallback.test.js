'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractDetail
} = require('../scripts/discover-prticket');

const {
  assessMusicEvidence
} = require('../utils/assessMusicEvidence');

function page(title, body, date = '🗓️Funciones:') {
  return `
    <html>
      <head>
        <meta property="og:title"
              content="${title} - MULTIPLE LOCATION">
      </head>
      <body>
        <div>Comprar</div>
        <h1>${title}</h1>
        <article>${body}</article>
        <p>${date}</p>
        <footer>
          Acerca de nuestros conciertos y servicios.
        </footer>
      </body>
    </html>
  `;
}

test('Extracts theater description without standard date', () => {
  const detail = extractDetail(page(
    'Blanco Temblor',
    'La Fundación presenta una pieza teatral sobre la salud mental.'
  ));

  assert.match(detail.description_evidence, /pieza teatral/);
  assert.equal(detail.date_evidence, null);
  assert.equal(
    assessMusicEvidence(detail.description_evidence)
      .non_music_event_detected,
    true
  );
});

test('Tragicomedy is identified as theater', () => {
  const detail = extractDetail(page(
    'Santurcia',
    'Una tragicomedia llena de castillos y personajes.'
  ));

  assert.match(detail.description_evidence, /tragicomedia/);
  assert.equal(
    assessMusicEvidence(detail.description_evidence)
      .non_music_event_detected,
    true
  );
});

test('Stand-up is identified as non-musical', () => {
  const detail = extractDetail(page(
    'Los Más Buscados',
    'Un show de stand-up y humor irreverente.'
  ));

  assert.match(detail.description_evidence, /stand-up/);
  assert.equal(
    assessMusicEvidence(detail.description_evidence)
      .non_music_event_detected,
    true
  );
});

test('Does not import footer music as event evidence', () => {
  const detail = extractDetail(
    page('Evento sin descripción', '')
  );

  assert.equal(detail.description_evidence, null);
});

test('Existing descriptions with valid dates are preserved', () => {
  const detail = extractDetail(page(
    'Concierto de Prueba',
    'Presentación de música en vivo con músicos invitados y canciones originales.',
    '🗓️ viernes, 22 de enero de 2027 ⏰ 7:00PM'
  ));

  assert.match(
    detail.description_evidence,
    /Presentación de música en vivo/
  );
  assert.equal(
    detail.date_evidence,
    'viernes, 22 de enero de 2027'
  );
});
