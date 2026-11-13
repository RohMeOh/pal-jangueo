# Pa’l Jangueo — Frontend

The React client for Pa’l Jangueo, a bilingual live music discovery application for Puerto Rico. Spanish is the default language; English is available through the navigation toggle.

[Live MVP](https://pal-jangueo.vercel.app) · [Project overview](../README.md) · [Backend guide](../server/README.md)

## Features

- Browse upcoming music events and follow the original ticketing links.
- Search by event, artist, or venue; narrow results by date, location, and price.
- Navigate a month-by-month event calendar.
- Save or remove favorites in **Mi Jangueo**, with local browser persistence and independent search/sorting.
- Switch between Spanish and English without losing the current browsing experience.
- View a responsive interface with event flyers, fallback images, and location links.

The browser reads the **Express API**. It does not scrape ticketing sites, call Gemini, approve candidates, or modify the database. The number of visible events depends on the backend's verified catalog, not on a hardcoded frontend list.

## Stack

React, Vite, JavaScript, CSS, Fuse.js for search, and the project's translation module in `src/i18n.js`.

## Organization

```text
client/
├── public/           Favicon and approved artwork
├── src/
│   ├── components/   Event feed, cards, filters, calendar, navigation
│   ├── utils/        Search, favorites, formatting, filter facets
│   ├── App.jsx       Top-level language state
│   ├── i18n.js       Interface translations
│   └── main.jsx      React entry point
├── tests/            Frontend utility tests
├── index.html
└── package.json
```

## Run locally

Use Node.js 24 and npm. Start the backend separately if you need live data.

```bash
cd client
npm ci
```

Set `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001
```

```bash
npm run dev
```

The default Vite address is usually `http://localhost:5173`.

## Verify changes

```bash
node --test tests/*.test.*
npm run lint
npm run build
```

The frontend should continue working when browser storage is unavailable, although favorites and language preference cannot persist in that case. UI data such as venue names, event titles, and dates comes from the backend and is displayed using Puerto Rico-specific formatting.

## Project status

This client is part of an **active-development beta**, not a finished commercial release. The application is independent of the ticketing providers. Purchases and final event availability remain on their official websites. The Pa’l Jangueo name is intended for a future trademark registration; no registration or application is claimed here.

Maintained by **[Romeo González (RohMeOh)](https://github.com/RohMeOh)**.
