import Fuse from 'fuse.js';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEARCH_FIELDS = [
  'title',
  'description',
  'venue',
  'municipality',
  'neighborhood',
  'region'
];

const FUSE_OPTIONS = {
  threshold: 0.42,
  ignoreLocation: true,
  ignoreFieldNorm: true,
  useTokenSearch: true,
  tokenMatch: 'all',
  includeScore: true
};

export function createEventSearch(events) {
  const records = events.map(event => ({
    event,
    title: normalize(event.title),
    description: normalize(event.description),
    venue: normalize(event.venue_name),
    municipality: normalize(event.municipality),
    neighborhood: normalize(event.neighborhood),
    region: normalize(event.region)
  }));

  const eventFuse = new Fuse(records, {
    ...FUSE_OPTIONS,
    keys: [
      { name: 'title', weight: 5 },
      { name: 'venue', weight: 3 },
      { name: 'municipality', weight: 3 },
      { name: 'neighborhood', weight: 2 },
      { name: 'region', weight: 2 },
      { name: 'description', weight: 1 }
    ]
  });

  const unique = new Map();

  for (const event of events) {
    const choices = [
      ['title', event.title],
      ['venue', event.venue_name],
      ['municipality', event.municipality],
      ['neighborhood', event.neighborhood],
      ['region', event.region]
    ];

    for (const [kind, label] of choices) {
      if (typeof label !== 'string' || !label.trim()) {
        continue;
      }

      const key = `${kind}:${normalize(label)}`;

      if (!unique.has(key)) {
        unique.set(key, {
          kind,
          label: label.trim(),
          searchable: normalize(label)
        });
      }
    }
  }

  const catalog = [...unique.values()];

  const suggestionFuse = new Fuse(catalog, {
    ...FUSE_OPTIONS,
    keys: ['searchable']
  });

  function find(query) {
    const term = normalize(query);

    if (!term) return events;

    // A complete event title identifies every performance of that event.
    // Do not mix an exact selection with unrelated fuzzy matches.
    const exactTitles = records.filter(record => record.title === term);
    if (exactTitles.length) return exactTitles.map(record => record.event);

    const literalMatches = records.filter(record =>
      SEARCH_FIELDS.some(field => record[field].includes(term))
    );

    if (literalMatches.length) {
      // Prefer titles to descriptions; retain date order within each group.
      const priority = record => record.title.startsWith(term) ? 0
        : record.title.includes(term) ? 1 : 2;
      return literalMatches
        .sort((a, b) => priority(a) - priority(b))
        .map(record => record.event);
    }

    // Use typo tolerance only when no literal match exists. Keep Fuse's
    // relevance order instead of restoring the original chronological order.
    if (term.length < 3) return [];
    return eventFuse.search(term).map(result => result.item.event);
  }

  function suggest(query) {
    const term = normalize(query);

    if (term.length < 2) return [];

    if (term.length < 3) {
      return catalog
        .filter(item => item.searchable.includes(term))
        .slice(0, 5);
    }

    const matches = suggestionFuse
      .search(term, { limit: 25 })
      .map(result => ({
        ...result.item,
        score: result.score ?? 1
      }));

    function priority(item) {
      if (item.searchable === term) return 0;
      if (item.searchable.startsWith(term)) return 1;
      if (item.searchable.includes(term)) return 2;
      return 3;
    }

    matches.sort((a, b) =>
      priority(a) - priority(b) || a.score - b.score
    );

    return matches.slice(0, 5);
  }

  return { find, suggest };
}
