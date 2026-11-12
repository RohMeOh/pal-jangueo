// Display-only event title formatting.
// Event IDs, original API data, searches, favorites, and stored titles are unchanged.

const SMALL_WORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las',
  'lo', 'los', 'o', 'para', 'por', 'sin', 'u', 'un', 'una',
  'unos', 'unas', 'y', 'feat', 'vs',
  'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the', 'to', 'with'
]);

// Explicitly known acronyms and stylized artist names, not arbitrary all-caps words.
const PRESERVED_WORDS = new Set([
  'OSPR', 'DJ', 'DJS', 'BVS', 'BTS', 'PR', 'UPR', 'VIP',
  'MTV', 'RIP', 'PH', 'USA', 'NYC', 'EDM', 'EP', 'LP',
  'MC', 'ÌFÉ', 'IFÉ', 'CHUWI', 'MIMA', 'Y2KOMEBACK'
]);

// Very limited, event-specific corrections. Do not guess accents in artists' names.
const EXACT_DISPLAY_TITLES = new Map([
  ['VOCES DE AMERICA', 'Voces de América']
]);

export function formatEventTitle(value) {
  if (typeof value !== 'string') return '';

  const title = value.trim();
  if (!title) return '';

  // Keep approved intentional/mixed capitalization untouched.
  if (title !== title.toLocaleUpperCase('es-PR')) return title;
  if (!/\p{L}/u.test(title)) return title;

  const exact = EXACT_DISPLAY_TITLES.get(title.replace(/\s+/g, ' '));
  if (exact) return exact;

  let previousEnd = 0;
  return title.replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu,
    (word, position) => {
      const separator = title.slice(previousEnd, position);
      const isStart = previousEnd === 0 ||
        /[:.!?]\s*$/u.test(separator) ||
        /\s[-–—]\s*$/u.test(separator);
      previousEnd = position + word.length;

      if (PRESERVED_WORDS.has(word)) return word;
      // Keep artist names such as Y2KOMEBACK and alphanumeric marks intact.
      if (/\p{L}/u.test(word) && /\p{N}/u.test(word)) return word;
      const lower = word.toLocaleLowerCase('es-PR');
      if (!isStart && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es-PR') + lower.slice(1);
    });
}
