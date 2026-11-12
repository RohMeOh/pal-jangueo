// Shared, read-only logic for the event results and filter choices.
// All date comparisons use Puerto Rico local calendar days.
export const REGIONS = [
  'La Metro', 'Norte', 'Sur', 'Este', 'El West', 'El Centro'
];

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Puerto_Rico',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function eventDay(startAt) {
  if (!startAt) return '';
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return '';
  const parts = dayFormatter.formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function hasFreeOption(event) {
  return event.price_type === 'free' || (
    event.price_type === 'paid' &&
    event.price_min != null &&
    Number(event.price_min) === 0
  );
}

export function matchesEventFacets(event, filters, excluded = []) {
  const ignore = new Set(excluded);

  for (const field of ['region', 'municipality', 'neighborhood']) {
    if (!ignore.has(field) && filters[field] && event[field] !== filters[field]) {
      return false;
    }
  }

  if (!ignore.has('price')) {
    if (filters.price === 'free' && !hasFreeOption(event)) return false;
    if (filters.price === 'paid' && event.price_type !== 'paid') return false;
  }

  const filterFrom = !ignore.has('fromDate') && filters.fromDate;
  const filterTo = !ignore.has('toDate') && filters.toDate;
  if (filterFrom || filterTo) {
    const day = eventDay(event.start_at);
    if (!day) return false;
    if (filterFrom && day < filterFrom) return false;
    if (filterTo && day > filterTo) return false;
  }

  return true;
}

// For a dropdown, omit its own selection and any dependent geographic levels.
// Otherwise, selecting a new region could be blocked by the previous town.
const FACET_EXCLUSIONS = {
  region: ['region', 'municipality', 'neighborhood'],
  municipality: ['municipality', 'neighborhood'],
  neighborhood: ['neighborhood'],
  price: ['price']
};

export function availableFacetValues(searchMatchedEvents, filters, field) {
  const excluded = FACET_EXCLUSIONS[field];
  if (!excluded) throw new Error(`Unsupported facet: ${field}`);

  const matching = searchMatchedEvents.filter(event =>
    matchesEventFacets(event, filters, excluded)
  );

  if (field === 'price') {
    const available = new Set();
    if (matching.some(hasFreeOption)) available.add('free');
    if (matching.some(event => event.price_type === 'paid')) available.add('paid');
    return available;
  }

  return new Set(matching.map(event => event[field]).filter(Boolean));
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

export function updateFilterState(previous, field, value, events) {
  const next = { ...previous, [field]: value };

  if (field === 'region') {
    next.municipality = '';
    next.neighborhood = '';
  } else if (field === 'municipality') {
    next.neighborhood = '';
    if (!value) {
      // Preserve the existing clear-town-and-region interaction.
      next.region = '';
    } else {
      const regions = uniqueValues(events
        .filter(event => event.municipality === value)
        .map(event => event.region)
        .filter(region => REGIONS.includes(region)));
      if (regions.length === 1) next.region = regions[0];
      else if (next.region && !regions.includes(next.region)) next.region = '';
    }
  } else if (field === 'neighborhood' && value) {
    // Auto-fill only when the neighborhood clearly belongs to one town/region.
    // Do not guess when barrio names repeat across municipalities.
    const candidates = events.filter(event =>
      event.neighborhood === value &&
      (!next.region || event.region === next.region) &&
      (!next.municipality || event.municipality === next.municipality)
    );
    if (!next.municipality) {
      const towns = uniqueValues(candidates.map(event => event.municipality));
      if (towns.length === 1) next.municipality = towns[0];
    }
    if (!next.region) {
      const regions = uniqueValues(candidates
        .map(event => event.region)
        .filter(region => REGIONS.includes(region)));
      if (regions.length === 1) next.region = regions[0];
    }
  } else if (field === 'fromDate' && value && next.toDate && value > next.toDate) {
    next.toDate = '';
  } else if (field === 'toDate' && value && next.fromDate && value < next.fromDate) {
    next.fromDate = '';
  }

  return next;
}
