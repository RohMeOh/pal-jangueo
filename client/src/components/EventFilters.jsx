import './EventFilters.css';

const REGIONS = [
  'La Metro',
  'Norte',
  'Sur',
  'Este',
  'El West',
  'El Centro'
];

export default function EventFilters({
  events,
  filters,
  setFilters
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
      }

      return next;
    });
  }

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
        <label htmlFor="filter-search">Buscar</label>
        <input
          id="filter-search"
          type="search"
          placeholder="Evento, artista o local..."
          value={filters.search}
          onChange={e => update('search', e.target.value)}
        />
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-region">Región</label>
        <select
          id="filter-region"
          value={filters.region}
          onChange={e => update('region', e.target.value)}
        >
          <option value="">Todas las regiones</option>
          {REGIONS.map(region => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-municipality">Municipio</label>
        <select
          id="filter-municipality"
          value={filters.municipality}
          onChange={e => update('municipality', e.target.value)}
        >
          <option value="">Todos los municipios</option>
          {municipalities.map(municipality => (
            <option key={municipality} value={municipality}>
              {municipality}
            </option>
          ))}
        </select>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-neighborhood">Barrio / Sector</label>
        <select
          id="filter-neighborhood"
          value={filters.neighborhood}
          onChange={e => update('neighborhood', e.target.value)}
        >
          <option value="">Todos los barrios</option>
          {neighborhoods.map(neighborhood => (
            <option key={neighborhood} value={neighborhood}>
              {neighborhood}
            </option>
          ))}
        </select>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-from">Desde</label>
        <div className="pj-date-field">
          <input
            id="filter-from"
            type="date"
            className={!filters.fromDate ? 'pj-date-empty' : ''}
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={e => update('fromDate', e.target.value)}
          />
          {!filters.fromDate && (
            <span className="pj-date-hint" aria-hidden="true">
              Selecciona una fecha
            </span>
          )}
        </div>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-to">Hasta</label>
        <div className="pj-date-field">
          <input
            id="filter-to"
            type="date"
            className={!filters.toDate ? 'pj-date-empty' : ''}
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={e => update('toDate', e.target.value)}
          />
          {!filters.toDate && (
            <span className="pj-date-hint" aria-hidden="true">
              Selecciona una fecha
            </span>
          )}
        </div>
      </div>

      <div className="pj-filter">
        <label htmlFor="filter-price">Precio</label>
        <select
          id="filter-price"
          value={filters.price}
          onChange={e => update('price', e.target.value)}
        >
          <option value="">Todos los precios</option>
          <option value="free">Con opción gratis</option>
          <option value="paid">De pago</option>
        </select>
      </div>

      <button
        className="pj-clear-filters"
        type="button"
        onClick={clearFilters}
      >
        Quitar filtros
      </button>
    </div>
  );
}
