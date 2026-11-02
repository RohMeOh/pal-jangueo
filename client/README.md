# Pa’l Jangueo — Web Client

> **Status:** Active development · Beta/MVP · Trademark registration planned

The **Pa’l Jangueo web client** is the React-based, Spanish-first interface for discovering live music events across Puerto Rico. This frontend is part of an **independent project under ongoing development**; its current implementation is not presented as a finished commercial release.

**[Live MVP](https://pal-jangueo.vercel.app)** · **[Main project README](../README.md)**

## Current capabilities

- **React + Vite** interface with responsive layouts for desktop and mobile.
- **Spanish / English toggle**, with Spanish as the default experience.
- **Browse and search events** with filters for date, location, and price.
- **Mi Jangueo** browser-based favorites using local storage; no user account is required.
- **Event calendar** for exploring upcoming performances by day.
- **Event cards** with flyer fallback art and official ticket and location links.
- **Puerto Rico date and time formatting** for event information.

The UI reads published event data from the Express backend. **Availability and coverage depend on the current catalog and validation process**; this beta does not claim to include every event in Puerto Rico.

## Tech stack

| Purpose | Technology |
| --- | --- |
| UI | React, JavaScript, CSS |
| Development and bundling | Vite |
| Search | Fuse.js and application search utilities |
| Localization | Project translation module (`src/i18n.js`) |
| Linting | Oxlint |
| Data | Express API (`GET /api/events`) |

## Project layout

```text
client/
├── public/              # Static frontend assets (when present)
├── src/
│   ├── assets/          # Application assets
│   ├── components/      # Event feed, cards, filters and calendar
│   ├── utils/           # Search and display utilities
│   ├── App.jsx          # Application entry view and language state
│   ├── i18n.js          # Spanish / English UI translations
│   └── main.jsx         # React bootstrap
├── package.json
└── README.md
```

## Run locally

**Requirements:** Node.js 24 and npm. Run the backend separately if you want live event data.

```bash
cd client
npm ci
```

Create `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001
```

Start Vite:

```bash
npm run dev
```

Check the production build and lint rules:

```bash
npm run build
npm run lint
```

The default local Vite URL is typically `http://localhost:5173`.

## Integration and development notes

- The client **does not scrape ticketing sites or execute Gemini requests on demand**; ingestion and AI-assisted analysis are handled by the backend workflows.
- Event publishing is governed by backend source validation and review safeguards.
- Features and copy may change while the beta is being refined.
- Keep secrets and private credentials out of frontend source files and environment values exposed through `VITE_`.

## Development and trademark notice

**Pa’l Jangueo remains in development.** Registration of the **Pa’l Jangueo** name as a trademark is **planned for a future stage**; this README does **not** claim that the trademark has already been registered or that a registration application has been filed.

The project is an independent music-event discovery application; purchases and final event information remain with the relevant official ticketing provider.

## Maintainer

**[Romeo González (RohMeOh)](https://github.com/RohMeOh)** · [Project repository](https://github.com/RohMeOh/pal-jangueo)
