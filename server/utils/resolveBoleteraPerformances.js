// Resolve multiple performances using matching API dates and official offers.
// Pure: never writes, approves or publishes.
function normalize(value) {
  return String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveBoleteraPerformances(raw, item) {
  if (
    raw.event_type !== 'MusicEvent' ||
    !item.api_record ||
    item.api_invalid_dates ||
    normalize(raw.name) !== normalize(item.api_title) ||
    raw.source_url !== item.event_url
  ) {
    throw new Error('Fuente, identidad o fechas API no verificadas.');
  }

  const dates = item.api_dates;
  if (
    !Array.isArray(dates) || dates.length < 2 ||
    new Set(dates).size !== dates.length
  ) {
    throw new Error('Se requieren varias fechas únicas.');
  }

  if (raw.start_date) {
    const primary = new Date(raw.start_date);
    if (
      !Number.isFinite(+primary) ||
      !dates.includes(primary.toISOString())
    ) {
      throw new Error('La fecha principal contradice las funciones.');
    }
  }

  const weekdays = [
    'domingo', 'lunes', 'martes', 'miercoles',
    'jueves', 'viernes', 'sabado'
  ];
  const months = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];

  const offers = raw.offers || [];
  if (!offers.length) throw new Error('Faltan etiquetas oficiales.');

  const assigned = new Set();
  const results = [...dates].sort().map(value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      throw new Error('Fecha API sin normalizar.');
    }
    const date = new Date(value);
    if (!Number.isFinite(+date) || date.toISOString() !== value) {
      throw new Error('Fecha API inválida.');
    }

    // Puerto Rico uses UTC-04:00.
    const local = new Date(+date - 4 * 3600000);
    const matched = [];

    offers.forEach((offer, index) => {
      const label = normalize(offer.name);
      const m = label.match(
        /^(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s*\|\s*([a-z]{3})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
      );
      if (!m) return;

      const [, weekday, month, day, hour, minute = '00', period] = m;
      if (+hour < 1 || +hour > 12 || +minute > 59) return;
      const hours = (+hour % 12) + (period === 'pm' ? 12 : 0);

      if (
        weekday === weekdays[local.getUTCDay()] &&
        month === months[local.getUTCMonth()] &&
        +day === local.getUTCDate() &&
        hours === local.getUTCHours() &&
        +minute === local.getUTCMinutes() &&
        local.getUTCSeconds() === 0 &&
        local.getUTCMilliseconds() === 0 &&
        offer.url === raw.ticket_url
      ) {
        if (assigned.has(index)) {
          throw new Error('Etiqueta ambigua entre fechas.');
        }
        assigned.add(index);
        matched.push(offer);
      }
    });

    if (!matched.length) {
      throw new Error('Fecha API sin etiqueta oficial coincidente: ' + value);
    }

    return {
      ...raw,
      start_date: value,
      offers: matched
    };
  });

  if (assigned.size !== offers.length) {
    throw new Error('Hay boletos sin función conciliada.');
  }

  return results;
}

module.exports = { resolveBoleteraPerformances };
