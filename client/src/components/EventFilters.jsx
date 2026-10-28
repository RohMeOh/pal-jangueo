import { useEffect, useId, useRef, useState } from 'react';
import './EventFilters.css';
import { t } from '../i18n';

export const REGIONS = [
  'La Metro',
  'Norte',
  'Sur',
  'Este',
  'El West',
  'El Centro'
];

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

export default function EventFilters({
  events,
  filters,
  setFilters,
  language,
  getSuggestions,
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

  const municipalities = [...new Set(
    events
      .filter(event =>
        !filters.region || event.region === filters.region
      )
      .map(event => event.municipality)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'es'));

  const neighborhoods = [...new Set(
    events
      .filter(event =>
        (!filters.region || event.region === filters.region) &&
        (!filters.municipality ||
          event.municipality === filters.municipality)
      )
      .map(event => event.neighborhood)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'es'));

  function update(field, value) {
    setFilters(previous => {
      const next = { ...previous, [field]: value };

      if (field === 'region') {
        next.municipality = '';
        next.neighborhood = '';
      }

      if (field === 'municipality') {
        next.neighborhood = '';

        // Al volver a Todos los municipios, limpiar también Región.
        if (!value) {
          next.region = '';
        }

        // Completar automáticamente la región si no hay una seleccionada.
        if (value && !previous.region) {
          const matchingRegions = [...new Set(
            events
              .filter(event => event.municipality === value)
              .map(event => event.region)
              .filter(region => REGIONS.includes(region))
          )];

          // Solo autoseleccionar cuando la asociación sea inequívoca.
          if (matchingRegions.length === 1) {
            next.region = matchingRegions[0];
          }
        }
      }

      return next;
    });
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
      <div className="pj-filter pj-filter-search pj-search-suggest-wrap" ref={searchRef}>
        <label htmlFor="filter-search">{t(language, 'Buscar')}</label>
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
                  {suggestion.label}
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
        <select
          id="filter-region"
          value={filters.region}
          onChange={e => update('region', e.target.value)}
        >
          <option value="">{t(language, 'Todas las regiones')}</option>
          {REGIONS.map(region => (
            <option key={region} value={region}>
              {t(language, region)}
            </option>
          ))}
        </select>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-municipality">{t(language, 'Municipio')}</label>
        <select
          id="filter-municipality"
          value={filters.municipality}
          onChange={e => update('municipality', e.target.value)}
        >
          <option value="">{t(language, 'Todos los municipios')}</option>
          {municipalities.map(municipality => (
            <option key={municipality} value={municipality}>
              {municipality}
            </option>
          ))}
        </select>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-neighborhood">{t(language, 'Barrio / Sector')}</label>
        <select
          id="filter-neighborhood"
          value={filters.neighborhood}
          onChange={e => update('neighborhood', e.target.value)}
        >
          <option value="">{t(language, 'Todos los barrios')}</option>
          {neighborhoods.map(neighborhood => (
            <option key={neighborhood} value={neighborhood}>
              {neighborhood}
            </option>
          ))}
        </select>
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
          />
          <span
            className={`pj-date-hint${filters.toDate ? ' pj-date-selected' : ''}`}
            aria-hidden="true"
          >
            {formatFilterDate(filters.toDate, language)}
          </span>
        </div>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-price">{t(language, 'Precio')}</label>
        <select
          id="filter-price"
          value={filters.price}
          onChange={e => update('price', e.target.value)}
        >
          <option value="">{t(language, 'Todos los precios')}</option>
          <option value="free">{t(language, 'Con opción gratis')}</option>
          <option value="paid">{t(language, 'De pago')}</option>
        </select>
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
