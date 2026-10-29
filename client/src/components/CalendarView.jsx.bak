import { useState } from 'react';
import { t } from '../i18n';
import './CalendarView.css';

const TIME_ZONE = 'America/Puerto_Rico';

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function puertoRicoDay(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const parts = dayFormatter.formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function moveMonth(key, amount) {
  const [year, month] = key.split('-').map(Number);
  return new Date(
    Date.UTC(year, month - 1 + amount, 1)
  ).toISOString().slice(0, 7);
}

function formatMonth(key, language) {
  const locale = language === 'en' ? 'en-US' : 'es-PR';
  const date = new Date(`${key}-15T12:00:00Z`);

  const month = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC'
  }).format(date);

  const year = key.slice(0, 4);

  return `${month} ${year}`;
}

function formatDay(key, language) {
  const formatted = new Intl.DateTimeFormat(
    language === 'en' ? 'en-US' : 'es-PR',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }
  ).format(new Date(`${key}T12:00:00Z`));

  const locale = language === 'en' ? 'en-US' : 'es-PR';

  return formatted.charAt(0).toLocaleUpperCase(locale)
    + formatted.slice(1);
}

const WEEKDAYS = {
  es: [
    ['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'],
    ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'],
    ['D', 'domingo']
  ],
  en: [
    ['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'],
    ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'],
    ['S', 'Sunday']
  ]
};

export default function CalendarView({
  events = [],
  loading,
  error,
  language,
  EventComponent
}) {
  const today = puertoRicoDay(new Date());

  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);

  const [year, monthNumber] = month.split('-').map(Number);

  // Monday-first grid. UTC prevents browser timezone offsets.
  const offset = (
    new Date(Date.UTC(year, monthNumber - 1, 1))
      .getUTCDay() + 6
  ) % 7;

  const daysInMonth = new Date(
    Date.UTC(year, monthNumber, 0)
  ).getUTCDate();

  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;

  const eventsByDay = new Map();

  for (const event of events) {
    const day = puertoRicoDay(event.start_at);
    if (!day) continue;

    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day).push(event);
  }

  const selectedEvents = [
    ...(eventsByDay.get(selectedDay) || [])
  ].sort((a, b) =>
    new Date(a.start_at) - new Date(b.start_at)
  );

  const monthCount = [...eventsByDay.entries()]
    .filter(([day]) => day.startsWith(month))
    .reduce((total, [, items]) => total + items.length, 0);

  function changeMonth(amount) {
    setMonth(current => moveMonth(current, amount));
    setSelectedDay(null);
  }

  function goToday() {
    const currentDay = puertoRicoDay(new Date());
    setMonth(currentDay.slice(0, 7));
    setSelectedDay(currentDay);
  }

  return (
    <section
      className="pj-calendar-page"
      id="calendario"
      aria-labelledby="pj-calendar-heading"
    >
      <div className="pj-calendar-intro">
        <p className="pj-calendar-eyebrow pj-eyebrow">
          {t(language, 'MÚSICA EN VIVO')}
        </p>
        <h1 id="pj-calendar-heading">
          {t(language, 'Calendario de eventos')}
        </h1>
      </div>

      <div className="pj-calendar-panel">
        <div className="pj-calendar-toolbar pj-calendar-toolbar-balanced">
          <div className="pj-calendar-today-slot">
            <button
              type="button"
              className="pj-calendar-today"
              onClick={goToday}
            >
              {t(language, 'Hoy')}
            </button>
          </div>

          <div className="pj-calendar-month-navigation">
            <button
              type="button"
              className="pj-calendar-month-arrow"
              aria-label={t(language, 'Mes anterior')}
              onClick={() => changeMonth(-1)}
            >
              ‹
            </button>

            <h2 className="pj-calendar-month">
              {formatMonth(month, language)}
            </h2>

            <button
              type="button"
              className="pj-calendar-month-arrow"
              aria-label={t(language, 'Mes siguiente')}
              onClick={() => changeMonth(1)}
            >
              ›
            </button>
          </div>

          <span className="pj-calendar-month-count">
            {monthCount} {t(
              language,
              monthCount === 1 ? 'evento' : 'eventos'
            )}
          </span>
        </div>

        <div className="pj-calendar-grid">
          {WEEKDAYS[language === 'en' ? 'en' : 'es']
            .map(([short, full], index) => (
              <div
                className="pj-calendar-weekday"
                key={index}
                title={full}
              >
                {short}
              </div>
            ))}

          {Array.from({ length: cellCount }, (_, index) => {
            const dayNumber = index - offset + 1;

            if (dayNumber < 1 || dayNumber > daysInMonth) {
              const outsideDate = new Date(
                Date.UTC(year, monthNumber - 1, dayNumber)
              );

              return (
                <div
                  className="pj-calendar-outside"
                  key={`outside-${index}`}
                  aria-hidden="true"
                >
                  <span className="pj-calendar-number">
                    {outsideDate.getUTCDate()}
                  </span>
                </div>
              );
            }

            const key = `${month}-${String(dayNumber).padStart(2, '0')}`;
            const count = eventsByDay.get(key)?.length || 0;

            return (
              <button
                type="button"
                key={key}
                className={[
                  'pj-calendar-day',
                  selectedDay === key ? 'is-selected' : '',
                  today === key ? 'is-today' : '',
                  count > 0 ? 'has-events' : ''
                ].filter(Boolean).join(' ')}
                aria-pressed={selectedDay === key}
                aria-label={
                  `${formatDay(key, language)} · ${count} ` +
                  t(language, count === 1 ? 'evento' : 'eventos')
                }
                onClick={() => setSelectedDay(key)}
              >
                <span className="pj-calendar-number">
                  {dayNumber}
                </span>
                {count > 0 && (
                  <span
                    className="pj-calendar-event-badge"
                    aria-hidden="true"
                  >
                    <span>{count}</span>
                    <span className="pj-calendar-event-word">
                      {t(language, count === 1 ? 'evento' : 'eventos')}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>


      </div>

      <section
        className="pj-calendar-results"
        aria-live="polite"
        aria-label={t(language, 'Eventos del día')}
      >
        <h2>
          {selectedDay
            ? formatDay(selectedDay, language)
            : t(language, 'Eventos del día')}
        </h2>

        {loading ? (
          <p className="pj-event-status">
            {t(language, 'Buscando eventos...')}
          </p>
        ) : error ? (
          <p className="pj-event-status" role="alert">
            {t(language, 'No pudimos cargar los eventos. Intenta nuevamente.')}
          </p>
        ) : !selectedDay ? (
          <p className="pj-calendar-message">
            {t(language, 'Selecciona un día para ver los eventos.')}
          </p>
        ) : selectedEvents.length === 0 ? (
          <p className="pj-calendar-message">
            {t(language, 'No hay eventos para esta fecha.')}
          </p>
        ) : (
          <div className="pj-event-grid">
            {selectedEvents.map(event => (
              <EventComponent
                key={event.id}
                event={event}
                language={language}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
