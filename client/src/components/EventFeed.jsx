import ApprovedHeroArt from './ApprovedHeroArt';
import { useEffect, useRef, useState } from 'react';
import './EventFeed.css';
import EventFilters from './EventFilters';
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

function getActiveSectionFromHash() {
  if (window.location.hash === '#calendario') return 'calendar';
  return ['#buscar', '#eventos', '#filtros'].includes(window.location.hash)
    ? 'search'
    : 'home';
}

function EventCard({ event, language }) {
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
            <span className="pj-poster-symbol">♫</span>
            <span>PA'L JANGUEO</span>
            <small>{t(language, 'La música de aquí')}</small>
          </div>
        )}
      </div>

      <div className="pj-event-content">
        <span className="pj-event-category">
          {t(language, 'MÚSICA EN VIVO')}
        </span>

        <h3>{event.title}</h3>

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
              {t(language, 'Ver ubicación')}
            </a>
          )}

          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pj-event-ticket"
            >
              {t(language, 'Ver boletos')}
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
  const [events, setEvents] = useState([]);
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

  const filteredEvents = events.filter(event => {
    const searchText = [
      event.title,
      event.venue_name,
      event.municipality,
      event.neighborhood
    ].filter(Boolean).join(' ').toLocaleLowerCase('es');

    if (
      filters.search &&
      !searchText.includes(
        filters.search.trim().toLocaleLowerCase('es')
      )
    ) return false;

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
      calendar: '#calendario'
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
              <span>{t(language, 'La isla suena.')}</span>
              <strong>{t(language, 'Sigue la música.')}</strong>
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
            language={language}
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
            {!loading && !error && (
              <span className="pj-event-count">
                {filteredEvents.length} {t(language, filteredEvents.length === 1 ? 'evento' : 'eventos')}
              </span>
            )}
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
              {filteredEvents.map(event => <EventCard key={event.id} event={event} language={language} />)}
            </div>
          )}
        </section>
          </div>
        )}
        {section === 'calendar' && (
          <CalendarView
            events={events}
            loading={loading}
            error={error}
            language={language}
            EventComponent={EventCard}
          />
        )}
      </main>

      <footer className="pj-site-footer">
        <div className="pj-footer-inner">
          <button type="button" className="pj-home-link" aria-label={t(language, "Pa'l Jangueo, volver al inicio")} onClick={() => openSection('home')}>
            <BrandLogo footer />
          </button>
          <div className="pj-footer-copy">
            <p>{t(language, 'La isla suena. Sigue la música.')}</p>
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
