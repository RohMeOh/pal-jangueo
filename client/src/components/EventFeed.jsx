import { useEffect, useRef, useState } from 'react';
import './EventFeed.css';
import './IconAction.css';
import EventFilters, { REGIONS } from './EventFilters';
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

const WAVE_HEIGHTS = [14, 32, 19, 50, 70, 43, 25, 59, 77, 47, 21, 35, 66, 40, 18, 49, 73, 35, 23, 51, 30];

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
    </svg>
  );
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

  function focusSearch() {
    document.getElementById('filter-search')?.focus();
    document.getElementById('filtros')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function chooseRegion(region) {
    setFilters(previous => ({
      ...previous,
      region: previous.region === region ? '' : region,
      municipality: '',
      neighborhood: ''
    }));
  }

  return (
    <div className="pj-site" id="inicio">
      <header className="pj-site-header">
        <div className="pj-header-inner">
          <a href="#inicio" className="pj-home-link" aria-label={t(language, "Pa'l Jangueo, inicio")}>
            <BrandLogo />
          </a>
          <div className="pj-language-toggle" role="group" aria-label={t(language, 'Idioma')}>
            <button type="button" lang="es" aria-pressed={language === 'es'} onClick={() => onLanguageChange('es')}>ES</button>
            <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button>
          </div>
          <nav className="pj-navigation" aria-label={t(language, 'Navegación principal')}>
            <a href="#eventos">{t(language, 'Explorar')}</a>
            <button type="button" onClick={focusSearch}>{t(language, 'Artistas')}</button>
            <button type="button" onClick={focusSearch}>Venues</button>
            <button
              type="button"
              onClick={() => aboutDialogRef.current?.showModal()}
              aria-haspopup="dialog"
              aria-controls="pj-about-dialog"
            >
              About
            </button>
            <a href="#mi-jangueo" className="pj-navigation-heart" aria-label={t(language, 'Mi Jangueo, próximamente')}>
              <HeartIcon />
            </a>
          </nav>
        </div>
      </header>

      <main className="pj-discovery">
        <section className="pj-hero" aria-labelledby="pj-main-heading">
          <div className="pj-hero-copy">
            <p className="pj-eyebrow">{t(language, 'LA ESCENA MUSICAL DE PUERTO RICO')}</p>
            <h1 id="pj-main-heading">
              <span>{t(language, 'La isla suena.')}</span>
              <strong>{t(language, 'Sigue la música.')}</strong>
            </h1>
            <p className="pj-hero-description">
              {t(language, 'De los escenarios más íntimos a los conciertos más grandes. Descubre la música en vivo que mueve a Puerto Rico.')}
            </p>
            <div className="pj-hero-actions">
              <a className="pj-button pj-button-primary" href="#eventos">
                {t(language, 'Explorar eventos')} <span aria-hidden="true">↗</span>
              </a>
              <button className="pj-button" type="button" onClick={focusSearch}>
                {t(language, 'Descubrir artistas')}
              </button>
            </div>
          </div>
          <div className="pj-hero-feature" aria-label={t(language, 'Todos los ritmos. Un solo archipiélago.')}>
            <div className="pj-feature-top">
              <span>{t(language, 'EN VIVO · PR')}</span>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 9v6M8 5v14M12 2v20M16 6v12M20 9v6" />
              </svg>
            </div>
            <div className="pj-waveform" aria-hidden="true">
              {WAVE_HEIGHTS.map((height, i) => (
                <span key={i} style={{ '--bar-height': `${height}px` }} />
              ))}
            </div>
            <div className="pj-feature-copy">
              <h2>{t(language, 'Todos los ritmos.')}<span>{t(language, 'Un solo archipiélago.')}</span></h2>
              <div className="pj-feature-genres">
                <ul className="pj-genre-list" aria-label={t(language, 'Géneros musicales')}>
                  {['Salsa', 'Rock', 'Indie', 'Urbana', 'Jazz'].map((genre) => (
                    <li key={genre}>{t(language, genre)}</li>
                  ))}
                </ul>
                <p className="pj-feature-more">{t(language, 'Y mucho más.')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="pj-filters-section" id="filtros" aria-labelledby="pj-filters-heading">
          <div className="pj-filter-heading">
            <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.8" fill="none" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
              <circle cx="9" cy="7" r="2" fill="#0e141c" />
              <circle cx="16" cy="12" r="2" fill="#0e141c" />
              <circle cx="11" cy="17" r="2" fill="#0e141c" />
            </svg>
            <div className="pj-filter-heading-copy">
              <h2 id="pj-filters-heading">{t(language, 'Busca tu próximo jangueo')}</h2>
              <p>{t(language, 'Explora eventos a tu manera.')}</p>
            </div>
          </div>
          <EventFilters events={events} filters={filters} setFilters={setFilters} language={language} />
          <div className="pj-region-chips" aria-label={t(language, 'Filtrar por región')}>
            <button type="button" className="pj-region-chip" aria-pressed={!filters.region} onClick={() => chooseRegion('')}>
              {t(language, 'Toda la isla')}
            </button>
            {REGIONS.map(region => (
              <button
                type="button"
                key={region}
                className="pj-region-chip"
                aria-pressed={filters.region === region}
                onClick={() => chooseRegion(region)}
              >
                {t(language, region)}
              </button>
            ))}
          </div>
        </section>

        <section className="pj-events" id="eventos" aria-labelledby="pj-events-heading">
          <div className="pj-section-heading">
            <div>
              <h2 id="pj-events-heading">{t(language, 'Explora lo que suena')}</h2>
              <p>{t(language, 'Descubre experiencias musicales por toda la isla.')}</p>
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

        <section className="pj-favorites" id="mi-jangueo" aria-labelledby="pj-favorites-heading">
          <div>
            <div className="pj-favorites-title">
              <HeartIcon />
              <h2 id="pj-favorites-heading">Mi Jangueo</h2>
            </div>
            <p>{t(language, 'Tu espacio para guardar artistas, lugares y eventos favoritos. Todo lo que te gusta, en un mismo sitio.')}</p>
          </div>
          <span className="pj-favorites-badge">{t(language, 'Próximamente')}</span>
        </section>
      </main>

      <footer className="pj-site-footer">
        <div className="pj-footer-inner">
          <a href="#inicio" className="pj-home-link" aria-label={t(language, "Pa'l Jangueo, volver al inicio")}>
            <BrandLogo footer />
          </a>
          <p>{t(language, 'La isla suena. Sigue la música.')}</p>
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
          <h2 id="pj-about-title">{t(language, "Sobre Pa'l Jangueo")}</h2>
          <p id="pj-about-description">
            {t(language, "Pa'l Jangueo es una aplicación en desarrollo dedicada a descubrir la música en vivo de Puerto Rico.")}
          </p>
          <p className="pj-about-registration">
            {t(language, 'Esta versión beta continúa evolucionando. El registro de la marca está previsto para una próxima etapa.')}
          </p>
          <p className="pj-about-copyright">
            {t(language, "© 2026 Pa'l Jangueo. Derechos reservados sobre el contenido original de la aplicación.")}
          </p>
        </div>
      </dialog>
    </div>
  );
}
