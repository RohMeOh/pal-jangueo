import { useEffect, useId, useRef, useState } from 'react';
import './EventFilters.css';
import { t } from '../i18n';
import FilterDropdown from './FilterDropdown';
import { formatEventTitle } from '../utils/formatEventTitle';
import { REGIONS, availableFacetValues, updateFilterState } from '../utils/eventFilterFacets';

function formatFilterDate(value, language) {
  if (!value) return t(language, 'Selecciona una fecha');

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-PR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function openDatePicker(event) {
  // Chrome/Vivaldi: clicking anywhere on a native date input should open its calendar.
  // Safari/mobile browsers without showPicker keep their native interaction.
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Ignore unsupported or restricted native picker calls.
  }
}

export default function EventFilters({
  events,
  filters,
  setFilters,
  language,
  getSuggestions,
  searchMatchedEvents = [],
  resultCount = null,
  expanded = false,
  onToggleExpanded
}) {
  const searchRef = useRef(null);
  const listId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = getSuggestions(filters.search);
  const suggestionsVisible = suggestionsOpen && suggestions.length > 0;

  useEffect(() => {
    function closeOutside(event) {
      if (!searchRef.current?.contains(event.target)) {
        setSuggestionsOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);

    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);

  function chooseSuggestion(suggestion) {
    setFilters(previous => ({
      ...previous,
      search: suggestion.label
    }));
    setSuggestionsOpen(false);
    setActiveIndex(-1);
  }

  // Facets react to every current filter, including text, dates and price.
  // Keep any selected value visible even if another filter yields zero matches.
  const availableRegions = availableFacetValues(searchMatchedEvents, filters, 'region');
  const availableTowns = availableFacetValues(searchMatchedEvents, filters, 'municipality');
  const availableAreas = availableFacetValues(searchMatchedEvents, filters, 'neighborhood');
  const availablePrices = availableFacetValues(searchMatchedEvents, filters, 'price');

  const regions = REGIONS.filter(region =>
    availableRegions.has(region) || region === filters.region
  );
  const municipalities = [...new Set([
    ...availableTowns,
    filters.municipality
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const neighborhoods = [...new Set([
    ...availableAreas,
    filters.neighborhood
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  function update(field, value) {
    setFilters(previous => updateFilterState(previous, field, value, events));
  }

  const activeCount = [
    'region',
    'municipality',
    'neighborhood',
    'fromDate',
    'toDate',
    'price'
  ].filter(field => Boolean(filters[field])).length;

  function clearFilters() {
    setFilters({
      search: '',
      region: '',
      municipality: '',
      neighborhood: '',
      fromDate: '',
      toDate: '',
      price: ''
    });
  }

  return (
    <div className="pj-filters">
      <div className="pj-filters-topbar">
        <span className="pj-filters-topbar-title">
          {t(language, 'Filtros')}
        </span>

        {resultCount !== null && (
          <span className="pj-event-count" role="status">
            {resultCount}{' '}
            {t(language, resultCount === 1 ? 'evento' : 'eventos')}
          </span>
        )}
      </div>

      <div className="pj-filter pj-filter-search pj-search-suggest-wrap" ref={searchRef}>
        <label htmlFor="filter-search">
          {language === 'en' ? 'Search by:' : 'Buscar por:'}
        </label>
        <input
          id="filter-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestionsVisible}
          aria-controls={suggestionsVisible ? listId : undefined}
          aria-activedescendant={
            suggestionsVisible && activeIndex >= 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          placeholder={t(language, 'Evento, artista o local...')}
          value={filters.search}
          onFocus={() => setSuggestionsOpen(true)}
          onChange={e => {
            update('search', e.target.value);
            setSuggestionsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setSuggestionsOpen(false);
              setActiveIndex(-1);
            } else if (e.key === 'ArrowDown' && suggestions.length) {
              e.preventDefault();
              setSuggestionsOpen(true);
              setActiveIndex(index => (index + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp' && suggestions.length) {
              e.preventDefault();
              setSuggestionsOpen(true);
              setActiveIndex(index =>
                index <= 0 ? suggestions.length - 1 : index - 1
              );
            } else if (
              e.key === 'Enter' &&
              suggestionsVisible &&
              activeIndex >= 0
            ) {
              e.preventDefault();
              chooseSuggestion(suggestions[activeIndex]);
            }
          }}
        />

        {suggestionsVisible && (
          <div
            id={listId}
            className="pj-search-suggestions"
            role="listbox"
            aria-label={
              language === 'en'
                ? 'Search suggestions'
                : 'Sugerencias de búsqueda'
            }
          >
            <p className="pj-suggestions-heading">
              {language === 'en'
                ? 'SUGGESTIONS'
                : 'SUGERENCIAS'}
            </p>
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.kind}:${suggestion.label}`}
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className="pj-search-suggestion"
                onMouseDown={event => event.preventDefault()}
                onClick={() => chooseSuggestion(suggestion)}
              >
                <span className="pj-suggestion-name">
                  {suggestion.kind === 'title'
                    ? formatEventTitle(suggestion.label)
                    : suggestion.label}
                </span>
                <span className="pj-suggestion-kind">
                  {{
                    title: language === 'en' ? 'Event' : 'Evento',
                    venue: language === 'en' ? 'Venue' : 'Local',
                    municipality: language === 'en' ? 'Municipality' : 'Municipio',
                    neighborhood: language === 'en' ? 'Neighborhood' : 'Barrio / Sector',
                    region: language === 'en' ? 'Region' : 'Región'
                  }[suggestion.kind]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="pj-mobile-filter-toggle"
        aria-expanded={expanded}
        aria-controls="pj-advanced-filters"
        onClick={onToggleExpanded}
      >
        <svg
          className={`pj-filter-triangle-icon${expanded ? ' is-open' : ''}`}
          viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        <span>{t(language, 'Filtros')}</span>
        {activeCount > 0 && (
          <span className="pj-mobile-filter-count">
            {activeCount}
          </span>
        )}
      </button>

      <div
        id="pj-advanced-filters"
        className={`pj-advanced-filters${expanded ? ' is-open' : ''}`}
      >
        <div className="pj-filter">
        <label htmlFor="filter-region">{t(language, 'Región')}</label>
        <FilterDropdown
          id="filter-region"
          label={t(language, 'Región')}
          value={filters.region}
          onChange={value => update('region', value)}
          options={[
            { value: '', label: t(language, 'Todas las regiones') },
            ...regions.map(region => ({ value: region, label: t(language, region) }))
          ]}
        />
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-municipality">{t(language, 'Municipio')}</label>
        <FilterDropdown
          id="filter-municipality"
          label={t(language, 'Municipio')}
          value={filters.municipality}
          onChange={value => update('municipality', value)}
          options={[
            { value: '', label: t(language, 'Todos los municipios') },
            ...municipalities.map(municipality => ({ value: municipality, label: municipality }))
          ]}
        />
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-neighborhood">{t(language, 'Barrio / Sector')}</label>
        <FilterDropdown
          id="filter-neighborhood"
          label={t(language, 'Barrio / Sector')}
          value={filters.neighborhood}
          onChange={value => update('neighborhood', value)}
          options={[
            { value: '', label: t(language, 'Todos los barrios') },
            ...neighborhoods.map(neighborhood => ({ value: neighborhood, label: neighborhood }))
          ]}
        />
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-price">{t(language, 'Precio')}</label>
        <FilterDropdown
          id="filter-price"
          label={t(language, 'Precio')}
          value={filters.price}
          onChange={value => update('price', value)}
          options={[
            { value: '', label: t(language, 'Todos los precios') },
            ...(availablePrices.has('free') || filters.price === 'free'
              ? [{ value: 'free', label: t(language, 'Con opción gratis') }] : []),
            ...(availablePrices.has('paid') || filters.price === 'paid'
              ? [{ value: 'paid', label: t(language, 'De pago') }] : [])
          ]}
        />
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-from">{t(language, 'Desde')}</label>
        <div className="pj-date-field">
          <input
            id="filter-from"
            type="date"
            className={!filters.fromDate ? 'pj-date-empty' : ''}
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={e => update('fromDate', e.target.value)}
            onClick={openDatePicker}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDatePicker(event);
              }
            }}
          />
          <span
            className={`pj-date-hint${filters.fromDate ? ' pj-date-selected' : ''}`}
            aria-hidden="true"
          >
            {formatFilterDate(filters.fromDate, language)}
          </span>
        </div>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-to">{t(language, 'Hasta')}</label>
        <div className="pj-date-field">
          <input
            id="filter-to"
            type="date"
            className={!filters.toDate ? 'pj-date-empty' : ''}
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={e => update('toDate', e.target.value)}
            onClick={openDatePicker}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDatePicker(event);
              }
            }}
          />
          <span
            className={`pj-date-hint${filters.toDate ? ' pj-date-selected' : ''}`}
            aria-hidden="true"
          >
            {formatFilterDate(filters.toDate, language)}
          </span>
        </div>
      </div>

      <button
        className="pj-clear-filters"
        type="button"
        onClick={clearFilters}
      >
        {t(language, 'Quitar filtros')}
      </button>
      </div>
    </div>
  );
}
