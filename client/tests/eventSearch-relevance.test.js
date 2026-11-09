import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventSearch } from '../src/utils/eventSearch.js';

// Chronological input: unrelated earlier events must not outrank CHUWI.
const events = [
  { id: 'early', title: 'OSPR CONCIERTO CLÁSICO 5',
    description: 'Concierto en vivo', municipality: 'San Juan' },
  { id: 'mention', title: 'Encuentro musical',
    description: 'Invitados: Chuwi y otros artistas', municipality: 'Ponce' },
  { id: 'chuwi', title: 'CHUWI en vivo',
    venue_name: 'Anfiteatro Tito Puente', municipality: 'San Juan' },
  { id: 'chuwi-2', title: 'CHUWI en vivo',
    venue_name: 'Anfiteatro Tito Puente', municipality: 'San Juan' },
  { id: 'other', title: 'HABICHUELAS', municipality: 'San Juan' },
  { id: 'accent', title: 'Esotérica Tropical', municipality: 'Bayamón' }
];
const search = createEventSearch(events);
const ids = query => search.find(query).map(event => event.id);

test('exact title returns all its performances, without fuzzy noise', () => {
  assert.deepEqual(ids('CHUWI en vivo'), ['chuwi', 'chuwi-2']);
});

test('exact titles ignore case, accents, and repeated whitespace', () => {
  assert.deepEqual(ids('  chuwi   EN vivo  '), ['chuwi', 'chuwi-2']);
  assert.deepEqual(ids('esoterica tropical'), ['accent']);
});

test('partial title outranks a description mention and excludes fuzzy noise', () => {
  assert.deepEqual(ids('chuw'), ['chuwi', 'chuwi-2', 'mention']);
});

test('typos still find the intended event first', () => {
  assert.equal(ids('chuwo en vivo')[0], 'chuwi');
});

test('venue and municipality searches keep all literal matches', () => {
  assert.deepEqual(ids('Tito Puente'), ['chuwi', 'chuwi-2']);
  assert.deepEqual(ids('San Juan'), ['early', 'chuwi', 'chuwi-2', 'other']);
});

test('artist names in descriptions remain searchable', () => {
  assert.ok(ids('Chuwi').includes('mention'));
});

test('empty search preserves the original upcoming order', () => {
  assert.deepEqual(search.find('   '), events);
});

test('selecting a title suggestion narrows results to its performances', () => {
  const suggestion = search.suggest('chuw')[0];
  assert.equal(suggestion.label, 'CHUWI en vivo');
  assert.deepEqual(ids(suggestion.label), ['chuwi', 'chuwi-2']);
});

test('empty catalogs and very short nonmatches return no results', () => {
  assert.deepEqual(createEventSearch([]).find('Chuwi'), []);
  assert.deepEqual(ids('zx'), []);
});
