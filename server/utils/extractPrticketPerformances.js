'use strict';

const {
  parsePuertoRicoDate
} = require('./normalizePrticketEvent');

// Detect official date/time pairs, not dates mentioned in prose.
function extractPrticketPerformances(html) {
  const text = String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
    .replace(/\s+/g, ' ');

  const pattern =
    /(?:🗓\uFE0F?|📅)\s*((?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,?\s*)?\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2})\s*(?:⏰|🕒)\s*(\d{1,2}:[0-5]\d\s*[ap]\.?\s*m\.?)/giu;

  const results = new Map();

  for (const match of text.matchAll(pattern)) {
    const dateText = match[1].replace(/\s+,/g, ',');
    const timeText = match[2];

    const startAt = parsePuertoRicoDate(dateText, timeText);

    if (!startAt) {
      throw new Error(
        'Función con fecha u hora oficial inválida.'
      );
    }

    if (!results.has(startAt)) {
      results.set(startAt, {
        date_text: dateText,
        time_text: timeText,
        start_at: startAt
      });
    }
  }

  if (results.size > 12) {
    throw new Error('Cantidad de funciones inesperada.');
  }

  return [...results.values()]
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

module.exports = { extractPrticketPerformances };
