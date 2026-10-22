import { useEffect, useState } from 'react';
import './EventFeed.css';
import EventFilters from './EventFilters';

const API_BASE = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');

function formatDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha por confirmar';
  }

  return new Intl.DateTimeFormat('es-PR', {
    timeZone: 'America/Puerto_Rico',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function formatPrice(event) {
  if (event.price_type === 'free') {
    return 'Gratis';
  }

  if (
    event.price_type === 'paid' &&
    Number(event.price_min) === 0 &&
    Number(event.price_max) > 0
  ) {
    return 'Opciones gratis y de pago';
  }

  if (event.price_min != null) {
    return `Desde $${Number(event.price_min).toFixed(2)}`;
  }

  return 'Precio por confirmar';
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function EventCard({ event }) {
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
              alt={`Cartel de ${event.title}`}
              loading="lazy"
              onError={() => setFlyerFailed(true)}
            />
          </>
        ) : (
          <div className="pj-event-poster-fallback">
            <span className="pj-poster-symbol">♫</span>
            <span>PA'L JANGUEO</span>
            <small>La música de aquí</small>
          </div>
        )}
      </div>

      <div className="pj-event-content">
        <span className="pj-event-category">
          MÚSICA EN VIVO
        </span>

        <h3>{event.title}</h3>

        <p className="pj-event-date">
          {formatDate(event.start_at)}
        </p>

        <p className="pj-event-venue">
          {event.venue_name}
          {event.municipality && ` · ${event.municipality}`}
        </p>

        <p className="pj-event-price">
          {formatPrice(event)}
        </p>

        <div className="pj-event-actions">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pj-event-map"
            >
              Ver ubicación
            </a>
          )}

          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pj-event-ticket"
            >
              Ver boletos
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function EventFeed() {
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
          setError('No pudimos cargar los eventos. Intenta nuevamente.');
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

  return (
    <main className="pj-discovery">
      <header className="pj-hero">
        <p className="pj-eyebrow">PA'L JANGUEO · PUERTO RICO</p>

        <h1>La música de aquí, en un solo lugar.</h1>

        <p>
          Descubre eventos, artistas y espacios de
          nuestra escena musical.
        </p>
      </header>

      <section className="pj-events">
        <div className="pj-section-heading">
          <h2>Próximos eventos</h2>

          {!loading && !error && (
            <span>{filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventos'}</span>
          )}
        </div>

        <EventFilters
          events={events}
          filters={filters}
          setFilters={setFilters}
        />

        {loading && (
          <p role="status">Buscando eventos...</p>
        )}

        {error && (
          <p role="alert">{error}</p>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="pj-empty">
            <h3>Pronto habrá música por aquí.</h3>
            <p>
              Estamos preparando los próximos eventos
              de la escena local.
            </p>
          </div>
        )}

        {!loading && !error &&
          events.length > 0 &&
          filteredEvents.length === 0 && (
            <div className="pj-empty">
              <h3>No encontramos eventos con esos filtros.</h3>
              <p>Prueba otra región, fecha o precio.</p>
            </div>
          )}

        {!loading && !error && filteredEvents.length > 0 && (
          <div className="pj-event-grid">
            {filteredEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
