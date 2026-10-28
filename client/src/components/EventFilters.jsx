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
  expanded = false,
  onToggleExpanded
}) {
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
      <div className="pj-filter pj-filter-search">
        <label htmlFor="filter-search">{t(language, 'Buscar')}</label>
        <input
          id="filter-search"
          type="search"
          placeholder={t(language, 'Evento, artista o local...')}
          value={filters.search}
          onChange={e => update('search', e.target.value)}
        />
      </div>

      <button
        type="button"
        className="pj-mobile-filter-toggle"
        aria-expanded={expanded}
        aria-controls="pj-advanced-filters"
        onClick={onToggleExpanded}
      >
        <svg viewBox="0 0 24 24" fill="none"
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
        <svg
          className={`pj-mobile-filter-chevron${expanded ? ' is-open' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
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
