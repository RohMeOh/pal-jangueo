// A pure, testable favorite-state transition. Storage writes happen in a React effect.
export function toggleFavoriteState(previous, event, savedAt) {
  const favorites = { ...previous.favorites };
  const dates = { ...previous.dates };
  const id = String(event.id);

  if (Object.prototype.hasOwnProperty.call(favorites, id)) {
    delete favorites[id];
    delete dates[id];
  } else {
    favorites[id] = event;
    dates[id] = dates[id] || savedAt;
  }

  return { favorites, dates, source: 'local' };
}
