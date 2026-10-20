// Pa'l Jangueo - Event display formatting

const TIMEZONE = 'America/Puerto_Rico';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Format event time consistently
export function formatEventTime(dateValue) {
  if (!dateValue) return 'Hora por confirmar';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Hora por confirmar';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

// Format event prices consistently
export function formatEventPrice(event) {
  if (event.price_type === 'free') {
    return 'Gratis';
  }

  if (event.price_type !== 'paid') {
    return 'Precio por confirmar';
  }

  const min = event.price_min == null
    ? null
    : Number(event.price_min);

  const max = event.price_max == null
    ? null
    : Number(event.price_max);

  if (
    (min !== null && (!Number.isFinite(min) || min < 0)) ||
    (max !== null && (!Number.isFinite(max) || max < 0))
  ) {
    return 'Precio por confirmar';
  }

  if (min !== null && max !== null) {
    if (max < min) return 'Precio por confirmar';

    if (min === max) {
      return currencyFormatter.format(min);
    }

    return `${currencyFormatter.format(min)} – ${currencyFormatter.format(max)}`;
  }

  if (min !== null) {
    return `Desde ${currencyFormatter.format(min)}`;
  }

  if (max !== null) {
    return `Hasta ${currencyFormatter.format(max)}`;
  }

  return 'Precio por confirmar';
}

// Format dates in Spanish
export function formatEventDate(dateValue) {
  if (!dateValue) return 'Fecha por confirmar';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha por confirmar';
  }

  const formatted = new Intl.DateTimeFormat('es-PR', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
