<div align="center">

# Pa’l Jangueo

**Discover Puerto Rico’s live music scene. All events. One app.**

An independent, Spanish-first live music discovery platform built for Puerto Rico.

[Explore the live MVP](https://pal-jangueo.vercel.app) · [Frontend documentation](./client/README.md) · [Technical audit](./docs/PRTICKET_MVP_CLOSURE.md)

**ACTIVE DEVELOPMENT** · **BETA / MVP** · **TRADEMARK REGISTRATION PLANNED**

</div>

> [!IMPORTANT]
> **Development and name notice:** Pa’l Jangueo is an evolving software project, not a finished commercial product. The **Pa’l Jangueo** name is intended for future trademark registration; **it is not presented here as a registered trademark**. This notice does not claim that a trademark application has been filed or that registration has been granted.

## About the project

Pa’l Jangueo brings music event information from Puerto Rican ticketing sources into a single, easy-to-explore experience. It aims to make local shows easier to find while helping audiences discover artists, venues, and music happening across the archipelago.

The project began as a **Holberton School final project in October 2026**. Its MVP is available as a technical demonstration, and development continues beyond that milestone. Features, sources, coverage, and the user interface may change as the project evolves.

## Current MVP features

- **Live music event discovery** using Boletera and PRticket as initial sources.
- **Search and filters** for events, artists, venues, dates, regions, municipalities, neighborhoods, and price.
- **Spanish-first, bilingual interface** with an English language toggle.
- **Mi Jangueo favorites** saved locally in the browser without requiring an account.
- **Event calendar** for browsing shows by date.
- **Event cards** with official ticket links, location links, and flyer fallbacks.
- **Responsive design** for mobile and desktop.
- **Event ingestion and validation** to help prevent outdated, duplicate, unsupported, or insufficiently verified listings.

> **Coverage note:** The application displays the events its current sources and validation workflows have successfully processed. The MVP does **not** guarantee a complete, real-time catalog of every live music event in Puerto Rico.

## AI-assisted event processing

The backend includes **Google Gemini API integration** to analyze event flyers and accompanying text. The processing workflow can extract structured event details and record supporting evidence, missing fields, and conflicting information.

AI output is **not treated as automatically verified**. Additional normalization, source checks, eligibility rules, and review or publication safeguards apply before information becomes publicly visible. The system supports automation while retaining controls for uncertain or unverified content.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express |
| Database | PostgreSQL through Supabase |
| AI processing | Google Gemini (`@google/genai`) |
| Discovery and automation | Node.js scripts, GitHub Actions |
| Testing and quality checks | Node.js test runner, Vite build, Oxlint |

## Repository structure

```text
pal-jangueo/
├── .github/workflows/   # Scheduled discovery and evaluation workflows
├── client/              # React application and bilingual UI
├── database/            # Database resources and schema
├── docs/                # Project notes and source audits
└── server/              # Express API, ingestion, AI analysis and validation
```

## Local setup

**Prerequisites:** Node.js 24, npm, and a PostgreSQL database configured with the project schema. Backend functionality that uses Gemini also requires a valid API key.

### 1. Backend

```bash
cd server
npm ci
```

Create `server/.env` with the appropriate development configuration:

```dotenv
DATABASE_URL=your_postgresql_connection_string
SUPABASE_CA_PATH=certs/supabase-ca.crt
CLIENT_ORIGINS=http://localhost:5173
PORT=3001
GEMINI_API_KEY=your_key_if_using_ai_features
```

Provide the database CA certificate at the configured path when required by your connection. **Never commit `.env`, API keys, or private certificates.**

```bash
npm run dev
```

### 2. Frontend

In another terminal:

```bash
cd client
npm ci
```

Create `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001
```

```bash
npm run dev
```

The Vite development server normally serves the client at `http://localhost:5173`.

## API endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/events` | Lists published upcoming events at verified venues. |
| `GET /api/health` | Checks the backend service. |
| `GET /api/db-health` | Checks the database connection. |

## Checks

```bash
# Backend tests
cd server
npm test

# Frontend production build and lint
cd ../client
npm run build
npm run lint
```

## Development roadmap

Work under consideration includes broader source coverage, richer artist and venue discovery, further personalization, accessibility improvements, and continued refinement of event validation. These items are **development goals**, not promises of availability in the current beta.

## Project independence and trademark notice

Pa’l Jangueo is an **independent project in active development**. Ticket purchases take place on the original provider’s website; listed event details and availability may change at the source. The application is not an official ticketing platform for the providers it references.

**Trademark status:** Registration of the **Pa’l Jangueo** name is **planned for a later stage and has not been represented as completed**. No `®` designation or claim of an approved registration is made here. The name and product may evolve during development.

## Author

Created by **[Romeo González (RohMeOh)](https://github.com/RohMeOh)** as a Holberton School final project and continued as an independent software project.
