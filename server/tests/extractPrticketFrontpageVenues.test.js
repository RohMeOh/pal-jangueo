const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractPrticketFrontpageVenues
} = require('../utils/extractPrticketFrontpageVenues');

test('Associates municipalities using official event URLs', () => {
  const html = `
    <div class="item-wrapper">
      <a href="https://boletos.prticket.com/events/es/evento1">
        <div class="venue">
          Hotel Caribe Hilton - San Juan, Puerto Rico
        </div>
      </a>
    </div>
    <div class="item-wrapper">
      <a href="https://boletos.prticket.com/events/es/evento2">
        <div class="venue">
          Complejo Deportivo Gelito Ortega - Naranjito, Puerto Rico
        </div>
      </a>
    </div>
  `;

  const locations = extractPrticketFrontpageVenues(html);

  assert.equal(locations.size, 2);

  assert.deepEqual(
    locations.get(
      'https://boletos.prticket.com/events/es/evento1'
    ),
    {
      venue: 'Hotel Caribe Hilton',
      municipality: 'San Juan',
      region: 'La Metro'
    }
  );

  assert.equal(
    locations.get(
      'https://boletos.prticket.com/events/es/evento2'
    ).municipality,
    'Naranjito'
  );
});

test('Rejects locations from unrelated domains', () => {
  const html = `
    <div class="item-wrapper">
      <a href="https://example.com/events/es/evento">
        <div class="venue">
          Hotel Caribe Hilton - San Juan, Puerto Rico
        </div>
      </a>
    </div>
  `;

  assert.equal(
    extractPrticketFrontpageVenues(html).size,
    0
  );
});
