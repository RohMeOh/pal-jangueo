import ApprovedHeroArt from './ApprovedHeroArt';
import { useEffect, useMemo, useRef, useState } from 'react';
import './EventFeed.css';
import EventFilters from './EventFilters';
import { createEventSearch } from '../utils/eventSearch';
import './IconAction.css';

import CalendarView from './CalendarView';
import BrandLogo from './BrandLogo';
import { t } from '../i18n';

const API_BASE = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');

function formatDate(dateString, language) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return t(language, 'Fecha por confirmar');
  }

  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-PR', {
    timeZone: 'America/Puerto_Rico',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function formatPrice(event, language) {
  if (event.price_type === 'free') {
    return t(language, 'Gratis');
  }

  if (
    event.price_type === 'paid' &&
    Number(event.price_min) === 0 &&
    Number(event.price_max) > 0
  ) {
    return t(language, 'Opciones gratis y de pago');
  }

  if (event.price_min != null) {
    return `${t(language, 'Desde')} $${Number(event.price_min).toFixed(2)}`;
  }

  return t(language, 'Precio por confirmar');
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const FAVORITES_KEY = 'pj-favorite-events-v1';
const FAVORITE_DATES_KEY = 'pj-favorite-dates-v1';

function readFavoriteDates() {
  try {
    return JSON.parse(
      window.localStorage.getItem(FAVORITE_DATES_KEY) || '{}'
    ) || {};
  } catch {
    return {};
  }
}

function readFavorites() {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(FAVORITES_KEY) || '{}'
    );
    return data && typeof data === 'object' && !Array.isArray(data)
      ? data : {};
  } catch {
    return {};
  }
}

function isUpcoming(event) {
  const date = new Date(event.start_at).getTime();
  return Number.isFinite(date) && date >= Date.now();
}

function getActiveSectionFromHash() {
  if (window.location.hash === '#calendario') return 'calendar';
  if (window.location.hash === '#mi-jangueo') return 'favorites';
  return ['#buscar', '#eventos', '#filtros'].includes(window.location.hash)
    ? 'search'
    : 'home';
}

function EventCard({
  event, language, isFavorite = false,
  onToggleFavorite = () => {}
}) {
  const [flyerFailed, setFlyerFailed] = useState(false);
  const flyerUrl = safeLink(event.flyer_url);

  const location = [
    event.venue_name,
    event.venue_address,
    event.municipality,
    'Puerto Rico'
  ].filter(Boolean).join(', ');

  const mapsUrl = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  const ticketUrl = safeLink(event.ticket_url);

  return (
    <article className="pj-event-card">
      <div className="pj-event-poster">
        {flyerUrl && !flyerFailed ? (
          <>
            <img
              className="pj-event-poster-backdrop"
              src={flyerUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
            />
            <img
              className="pj-event-poster-image"
              src={flyerUrl}
              alt={`${t(language, 'Cartel de')} ${event.title}`}
              loading="lazy"
              onError={() => setFlyerFailed(true)}
            />
          </>
        ) : (
          <div className="pj-event-poster-fallback">
            <BrandLogo />
          </div>
        )}
      </div>

      <div className="pj-event-content">
        <span className="pj-event-category">
          {t(language, 'MÚSICA EN VIVO')}
        </span>

        <div className="pj-event-title-row">
          <h3>{event.title}</h3>
          <button
            type="button"
            className={`pj-favorite-heart${isFavorite ? ' is-favorite' : ''}`}
            aria-pressed={isFavorite}
            aria-label={language === 'en'
              ? (isFavorite ? 'Remove from Mi Jangueo' : 'Save to Mi Jangueo')
              : (isFavorite ? 'Quitar de Mi Jangueo' : 'Guardar en Mi Jangueo')}
            title={language === 'en'
              ? (isFavorite ? 'Remove favorite' : 'Save favorite')
              : (isFavorite ? 'Quitar favorito' : 'Guardar favorito')}
            onClick={() => onToggleFavorite(event)}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill={isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
          </button>
        </div>

        <p className="pj-event-date">
          {formatDate(event.start_at, language)}
        </p>

        <p className="pj-event-venue">
          {event.venue_name}
          {event.municipality && ` · ${event.municipality}`}
        </p>

        <p className="pj-event-price">
          {formatPrice(event, language)}
        </p>

        <div className="pj-event-actions">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pj-event-map"
            >
              {t(language, 'Ver ubicación')} <span aria-hidden="true">↗</span>
            </a>
          )}

          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pj-event-ticket"
            >
              {t(language, 'Ver boletos')} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function EventFeed({ language, onLanguageChange }) {
  const aboutDialogRef = useRef(null);
  const [section, setSection] = useState(getActiveSectionFromHash);

  useEffect(() => {
    const syncSection = () => setSection(getActiveSectionFromHash());
    window.addEventListener('popstate', syncSection);
    window.addEventListener('hashchange', syncSection);
    return () => {
      window.removeEventListener('popstate', syncSection);
      window.removeEventListener('hashchange', syncSection);
    };
  }, []);
  const [favorites, setFavorites] = useState(readFavorites);
  const [favoriteFilter, setFavoriteFilter] = useState('upcoming');
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [favoriteDates, setFavoriteDates] = useState(readFavoriteDates);
  const [events, setEvents] = useState([]);

  function toggleFavorite(event) {
    setFavorites(previous => {
      const next = { ...previous };
      const id = String(event.id);

      if (Object.prototype.hasOwnProperty.call(next, id)) {
        delete next[id];
      } else {
        next[id] = event;
      }

      setFavoriteDates(previousDates => {
        const dates = { ...previousDates };
        if (Object.prototype.hasOwnProperty.call(next, id)) {
          dates[id] = dates[id] || Date.now();
        } else {
          delete dates[id];
        }
        try {
          window.localStorage.setItem(
            FAVORITE_DATES_KEY, JSON.stringify(dates)
          );
        } catch (error) {
          console.warn('Error guardando fecha del favorito', error);
        }
        return dates;
      });

      try {
        window.localStorage.setItem(
          FAVORITES_KEY, JSON.stringify(next)
        );
      } catch (error) {
        console.warn('No se pudieron guardar los favoritos', error);
      }

      return next;
    });
  }

  useEffect(() => {
    const syncFavorites = event => {
      if (
        event.key === FAVORITES_KEY ||
        event.key === FAVORITE_DATES_KEY ||
        event.key === null
      ) {
        setFavorites(readFavorites());
        setFavoriteDates(readFavoriteDates());
      }
    };

    window.addEventListener('storage', syncFavorites);
    return () => window.removeEventListener('storage', syncFavorites);
  }, []);

  const favoriteEvents = useMemo(() => {
    const current = new Map(
      events.map(event => [String(event.id), event])
    );

    const query = favoriteSearch.trim().toLocaleLowerCase('es');

    const saved = Object.entries(favorites)
      .map(([id, snapshot]) => ({
        ...(current.get(id) || snapshot),
        savedAt: Number(favoriteDates[id]) || 0
      }))
      .filter(isUpcoming)
      .filter(event => !query || [
        event.title,
        event.venue_name,
        event.municipality,
        event.description
      ].some(value =>
        String(value || '').toLocaleLowerCase('es').includes(query)
      ));

    const dateDiff = (a, b) =>
      new Date(a.start_at).getTime() -
      new Date(b.start_at).getTime();

    const nameDiff = (a, b) =>
      String(a.title || '').localeCompare(
        String(b.title || ''), 'es',
        { sensitivity: 'base', numeric: true }
      );

    return saved.sort((a, b) => {
      switch (favoriteFilter) {
        case 'farthest':
          return -dateDiff(a, b);
        case 'az':
          return nameDiff(a, b) || dateDiff(a, b);
        case 'za':
          return -nameDiff(a, b) || dateDiff(a, b);
        case 'newest':
          return b.savedAt - a.savedAt || dateDiff(a, b);
        case 'oldest':
          return a.savedAt - b.savedAt || dateDiff(a, b);
        default:
          return dateDiff(a, b);
      }
    });
  }, [events, favorites, favoriteDates, favoriteFilter, favoriteSearch]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    region: '',
    municipality: '',
    neighborhood: '',
    fromDate: '',
    toDate: '',
    price: ''
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Mostrar el aviso beta una sola vez por carga de la aplicación.
  // El botón About puede volver a abrirlo después de cerrarlo.
  useEffect(() => {
    const dialog = aboutDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const response = await fetch(`${API_BASE}/api/events`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data.events)) {
          throw new Error('Formato de eventos no válido.');
        }

        setEvents(data.events);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError('load');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => controller.abort();
  }, []);

  function getPuertoRicoDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Puerto_Rico',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const part = type =>
      parts.find(item => item.type === type)?.value;

    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  const eventSearch = useMemo(
    () => createEventSearch(events),
    [events]
  );

  const filteredEvents = eventSearch.find(filters.search).filter(event => {
    if (filters.region && event.region !== filters.region) {
      return false;
    }

    if (
      filters.municipality &&
      event.municipality !== filters.municipality
    ) return false;

    if (
      filters.neighborhood &&
      event.neighborhood !== filters.neighborhood
    ) return false;

    const day = getPuertoRicoDate(event.start_at);

    if (filters.fromDate && day < filters.fromDate) {
      return false;
    }

    if (filters.toDate && day > filters.toDate) {
      return false;
    }

    const hasFreeOption =
      event.price_type === 'free' ||
      (event.price_type === 'paid' &&
        event.price_min != null &&
        Number(event.price_min) === 0);

    if (filters.price === 'free' && !hasFreeOption) {
      return false;
    }

    if (
      filters.price === 'paid' &&
      event.price_type !== 'paid'
    ) return false;

    return true;
  });

  function openSection(nextSection) {
    const hashes = {
      home: '#bienvenidos',
      search: '#buscar',
      calendar: '#calendario',
      favorites: '#mi-jangueo'
    };
    const hash = hashes[nextSection] || hashes.home;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
    setSection(nextSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="pj-site" id="inicio">
      <header className="pj-site-header">
        <div className="pj-header-inner">
          <button type="button" className="pj-home-link" aria-label={t(language, "Pa'l Jangueo, inicio")} onClick={() => openSection('home')}>
            <BrandLogo />
          </button>
          <div className="pj-language-toggle" role="group" aria-label={t(language, 'Idioma')}>
            <button type="button" lang="es" aria-pressed={language === 'es'} onClick={() => onLanguageChange('es')}>ES</button>
            <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button>
          </div>
          <nav className="pj-navigation" aria-label={t(language, 'Navegación principal')}>
            <button type="button" className="pj-nav-link" aria-current={section === 'home' ? 'page' : undefined} onClick={() => openSection('home')}>
              {t(language, 'Bienvenido')}
            </button>
            <button type="button" className="pj-nav-link" aria-current={section === 'search' ? 'page' : undefined} onClick={() => openSection('search')}>
              {t(language, 'Buscar')}
            </button>
            <button
              type="button"
              className="pj-nav-link"
              aria-current={section === 'calendar' ? 'page' : undefined}
              onClick={() => openSection('calendar')}
            >
              {t(language, 'Calendario')}
            </button>
            <button
              type="button"
              className="pj-nav-link"
              aria-current={section === 'favorites' ? 'page' : undefined}
              onClick={() => openSection('favorites')}
            >
              Mi Jangueo
            </button>
            <button
              type="button"
              className="pj-nav-link"
              onClick={() => aboutDialogRef.current?.showModal()}
              aria-haspopup="dialog"
              aria-controls="pj-about-dialog"
            >
              About
            </button>
          </nav>
        </div>
      </header>

      <main className="pj-discovery">
        {section === 'home' && (
        <section className="pj-hero" id="bienvenido" aria-labelledby="pj-main-heading">
          <div className="pj-hero-copy">
            <p className="pj-eyebrow">{t(language, "BIENVENIDO A PA’L JANGUEO")}</p>
            <h1 id="pj-main-heading">
              <span>{t(language, 'Todos los eventos.')}</span>
              <strong>{t(language, 'Una sola app.')}</strong>
            </h1>
            <p className="pj-hero-description">
              {t(language, 'Pa’l Jangueo reúne eventos musicales de Puerto Rico en un solo lugar. Encuentra tu próximo jangueo por fecha, región, municipio o precio y llega directo a la boletera oficial.')}
            </p>
            <div className="pj-hero-actions">
              <button className="pj-button pj-button-primary" type="button" onClick={() => openSection('search')}>
                {t(language, 'Explorar eventos')} <span aria-hidden="true">↗</span>
              </button>
              <button
                className="pj-button pj-button-calendar"
                type="button"
                onClick={() => openSection('calendar')}
              >
                <svg viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M7 3v4M17 3v4M3 10h18" />
                </svg>
                {t(language, 'Calendario')}
              </button>
              <button
                className="pj-button pj-button-primary pj-button-my-jangueo"
                type="button"
                onClick={() => openSection('favorites')}
              >
                Mi Jangueo <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
          <div
            className="pj-hero-feature pj-hero-feature-approved"
            role="img"
            aria-label={t(language, 'Todos los ritmos. Un solo archipiélago.')}
          >
            <ApprovedHeroArt language={language} />
          </div>
        </section>
        )}

        {section === 'search' && (
          <div className="pj-search-page" id="buscar">
        <div className="pj-calendar-intro pj-search-intro">
          <p className="pj-calendar-eyebrow pj-eyebrow">
            {t(language, 'MÚSICA EN VIVO')}
          </p>
          <h1 id="pj-filters-heading">
            {t(language, 'Busca tu próximo jangueo')}
          </h1>
        </div>
        <section className="pj-filters-section" id="filtros" aria-labelledby="pj-filters-heading">
          <EventFilters
            events={events}
            filters={filters}
            setFilters={setFilters}
            getSuggestions={eventSearch.suggest}
            language={language}
            resultCount={!loading && !error ? filteredEvents.length : null}
            expanded={mobileFiltersOpen}
            onToggleExpanded={() =>
              setMobileFiltersOpen(previous => !previous)
            }
          />
        </section>

        <section className="pj-events" id="eventos" aria-labelledby="pj-events-heading">
          <div className="pj-section-heading">
            <div>
              <h2 id="pj-events-heading">{t(language, 'Explora lo que suena')}</h2>
            </div>
          </div>

          {loading && (
            <p className="pj-event-status pj-event-loading" role="status">
              <span className="pj-loading-spinner" aria-hidden="true" />
              {t(language, 'Buscando eventos...')}
            </p>
          )}
          {error && <p className="pj-event-status" role="alert">{t(language, 'No pudimos cargar los eventos. Intenta nuevamente.')}</p>}

          {!loading && !error && events.length === 0 && (
            <div className="pj-empty">
              <h3>{t(language, 'Pronto habrá música por aquí.')}</h3>
              <p>{t(language, 'Estamos preparando los próximos eventos de la escena local.')}</p>
            </div>
          )}

          {!loading && !error && events.length > 0 && filteredEvents.length === 0 && (
            <div className="pj-empty">
              <h3>{t(language, 'No encontramos eventos con esos filtros.')}</h3>
              <p>{t(language, 'Prueba otra región, fecha o precio.')}</p>
            </div>
          )}

          {!loading && !error && filteredEvents.length > 0 && (
            <div className="pj-event-grid">
              {filteredEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  language={language}
                  isFavorite={Object.prototype.hasOwnProperty.call(
                    favorites, String(event.id)
                  )}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
          </div>
        )}
        {section === 'favorites' && (
          <section
            className="pj-search-page pj-my-jangueo"
            id="mi-jangueo"
            aria-labelledby="pj-my-jangueo-heading"
          >
            <div className="pj-calendar-intro pj-search-intro">
              <p className="pj-calendar-eyebrow pj-eyebrow">
                {t(language, 'MÚSICA EN VIVO')}
              </p>
              <h1 id="pj-my-jangueo-heading">Mi Jangueo</h1>
              <p className="pj-my-jangueo-subtitle">
                {language === 'en'
                  ? 'Your favorite events, all here.'
                  : 'Tus eventos favoritos, todos aquí.'}
              </p>
            </div>

            {Object.keys(favorites).length > 0 && (
            <div className="pj-my-jangueo-controls">
              <label htmlFor="pj-favorite-filter">
                {language === 'en' ? 'Sort by:' : 'Ordenar por:'}
              </label>

              <input
                id="pj-favorite-search"
                className="pj-favorite-search pj-filter-search-input"
                type="search"
                value={favoriteSearch}
                onChange={event => setFavoriteSearch(event.target.value)}
                placeholder={language === 'en'
                  ? 'Event, artist or venue...'
                  : 'Evento, artista o local...'}
                aria-label={language === 'en'
                  ? 'Search favorite events'
                  : 'Buscar eventos favoritos'}
              />

              <select
                id="pj-favorite-filter"
                value={favoriteFilter}
                onChange={event =>
                  setFavoriteFilter(event.target.value)
                }
              >
                <option value="upcoming">
                  {language === 'en' ? 'Soonest first' : 'Próximos primero'}
                </option>
                <option value="farthest">
                  {language === 'en' ? 'Latest dates first' : 'Fechas más lejanas'}
                </option>
                <option value="az">A–Z</option>
                <option value="za">Z–A</option>
                <option value="newest">
                  {language === 'en'
                    ? 'Recently saved' : 'Guardados recientemente'}
                </option>
                <option value="oldest">
                  {language === 'en'
                    ? 'Oldest saved' : 'Guardados hace más tiempo'}
                </option>
              </select>

              <span className="pj-event-count">
                {favoriteEvents.length}{' '}
                {t(language,
                  favoriteEvents.length === 1 ? 'evento' : 'eventos')}
              </span>
            </div>
            )}

            {favoriteEvents.length > 0 ? (
              <div className="pj-event-grid">
                {favoriteEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    language={language}
                    isFavorite={true}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="pj-empty">
                <h3>
                  {Object.keys(favorites).length === 0
                    ? (language === 'en'
                      ? 'Your next jangueo starts here.'
                      : 'Tu próximo jangueo empieza aquí.')
                    : (language === 'en'
                      ? 'No upcoming favorites to show.'
                      : 'No hay favoritos próximos para mostrar.')}
                </h3>
                <p>
                  {Object.keys(favorites).length === 0
                    ? (language === 'en'
                      ? 'Explore events and tap the heart to save your favorites.'
                      : 'Explora los eventos y toca el corazón para guardar tus favoritos.')
                    : (language === 'en'
                      ? 'Try another search or save more events.'
                      : 'Prueba otra búsqueda o guarda más eventos.')}
                </p>
                <div className="pj-hero-actions pj-my-jangueo-actions">
                <button
                  type="button"
                  className="pj-button pj-button-primary"
                  onClick={() => openSection('search')}
                >
                  {t(language, 'Explorar eventos')} <span aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  className="pj-button pj-button-calendar"
                  onClick={() => openSection('calendar')}
                >
                  <svg viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M7 3v4M17 3v4M3 10h18" />
                  </svg>
                  {t(language, 'Calendario')}
                </button>
                </div>
              </div>
            )}
          </section>
        )}
        {section === 'calendar' && (
          <CalendarView
            events={events}
            loading={loading}
            error={error}
            language={language}
            EventComponent={EventCard}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </main>

      <footer className="pj-site-footer">
        <div className="pj-footer-inner">
          <button type="button" className="pj-home-link" aria-label={t(language, "Pa'l Jangueo, volver al inicio")} onClick={() => openSection('home')}>
            <BrandLogo footer />
          </button>
          <div className="pj-footer-copy">
            <p>{t(language, 'Todos los eventos. Una sola app.')}</p>
            <p className="pj-footer-copyright">
              {t(language, "© 2026 Pa'l Jangueo. Derechos reservados sobre el contenido original de la aplicación.")}
            </p>
          </div>
        </div>
      </footer>

      <dialog
        id="pj-about-dialog"
        ref={aboutDialogRef}
        className="pj-about-dialog"
        aria-labelledby="pj-about-title"
        aria-describedby="pj-about-description"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const { clientX, clientY } = event;
          if (
            clientX < rect.left || clientX > rect.right ||
            clientY < rect.top || clientY > rect.bottom
          ) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="pj-about-dialog-content">
          <button
            type="button"
            className="pj-about-close pj-icon-action"
            aria-label={t(language, 'Cerrar')}
            onClick={() => aboutDialogRef.current?.close()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <span className="pj-about-label">PA'L JANGUEO™ <span>BETA</span></span>
          <h2 id="pj-about-title">{t(language, "Sobre el app")}</h2>
          <p id="pj-about-description">
            {t(language, "Pa'l Jangueo es una aplicación en desarrollo. Esta versión beta continúa evolucionando. El registro de la marca está previsto para una próxima etapa.")}
          </p>
          <p className="pj-about-copyright">
            {t(language, "© 2026 Pa'l Jangueo. Derechos reservados sobre el contenido original de la aplicación.")}
          </p>
        </div>
      </dialog>
    </div>
  );
}
