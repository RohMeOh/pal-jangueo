import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleFavoriteState } from '../src/utils/favoriteState.js';

const event = { id: 'event-1', title: 'Concierto', start_at: '2026-11-15T16:00:00-04:00' };

test('favorite toggle saves the event and timestamp without mutating previous state', () => {
  const previous = { favorites: {}, dates: {}, source: 'storage' };
  const next = toggleFavoriteState(previous, event, 123456);
  assert.deepEqual(next, {
    favorites: { 'event-1': event },
    dates: { 'event-1': 123456 },
    source: 'local'
  });
  assert.deepEqual(previous, { favorites: {}, dates: {}, source: 'storage' });
});

test('favorite toggle removes an event and timestamp together', () => {
  const previous = {
    favorites: { 'event-1': event }, dates: { 'event-1': 123456 }, source: 'local'
  };
  assert.deepEqual(toggleFavoriteState(previous, event, 999999), {
    favorites: {}, dates: {}, source: 'local'
  });
  assert.equal(previous.favorites['event-1'], event);
  assert.equal(previous.dates['event-1'], 123456);
});

test('favorite toggle preserves unrelated favorites and original saved dates', () => {
  const other = { id: 'event-2', title: 'Otro concierto' };
  const previous = {
    favorites: { 'event-1': event, 'event-2': other },
    dates: { 'event-1': 12, 'event-2': 34 },
    source: 'local'
  };
  const next = toggleFavoriteState(previous, event, 999);
  assert.deepEqual(next.favorites, { 'event-2': other });
  assert.deepEqual(next.dates, { 'event-2': 34 });
  const again = toggleFavoriteState(next, event, 777);
  assert.deepEqual(again.dates, { 'event-2': 34, 'event-1': 777 });
});

test('favorite toggle preserves legacy saved dates when adding a missing snapshot', () => {
  const previous = { favorites: {}, dates: { 'event-1': 12 }, source: 'storage' };
  const next = toggleFavoriteState(previous, event, 999);
  assert.equal(next.dates['event-1'], 12);
});
