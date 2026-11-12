'use strict';

const {
  normalizePrticketEvent,
  parsePuertoRicoDate
} = require('./normalizePrticketEvent');

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function comparePublishedPrticket(events, card, detail) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('No hay funciones para comparar.');
  }

  const issues = new Set();
  const live = normalizePrticketEvent(card, detail);

  if (events.some(event =>
    normalize(event.title) !== normalize(card.title)
  )) {
    issues.add('TITULO_CAMBIADO');
  }

  if (!live.venue) {
    issues.add('LOCAL_NO_VERIFICABLE');
  } else if (events.some(event =>
    normalize(event.venue) !== normalize(live.venue)
  )) {
    issues.add('LOCAL_CAMBIADO');
  }

  const description = clean(detail.description_evidence);

  if (!description) {
    issues.add('DESCRIPCION_NO_EXTRAIBLE');
  } else if (events.some(event =>
    clean(event.description) !== description
  )) {
    issues.add('DESCRIPCION_CAMBIADA');
  }

  if (events.length > 1) {
    // A single date extracted from the page cannot verify
    // every performance. Never infer a reschedule.
    issues.add('FUNCIONES_MULTIPLES_REVISAR_FECHAS');
  } else {
    const dateText = String(detail.date_evidence || '')
      .replace(/\s+,/g, ',');

    const officialStart = parsePuertoRicoDate(
      dateText,
      detail.time_evidence
    );

    if (!officialStart) {
      issues.add('FECHA_NO_VERIFICABLE');
    } else {
      const savedDate = new Date(events[0].start_at);

      if (
        Number.isNaN(savedDate.getTime()) ||
        savedDate.toISOString() !== officialStart
      ) {
        issues.add('FECHA_CAMBIADA');
      }
    }
  }

  return [...issues];
}

module.exports = { comparePublishedPrticket };
