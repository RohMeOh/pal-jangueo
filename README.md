<div align="center">

# Pa’l Jangueo

**Discover Puerto Rico's live music scene. All events. One app.**

A Spanish-first, bilingual live music discovery project built for Puerto Rico.

[Live MVP](https://pal-jangueo.vercel.app) · [Frontend guide](./client/README.md) · [Backend guide](./server/README.md)

**BETA / MVP** · **ACTIVE DEVELOPMENT** · **TRADEMARK REGISTRATION PLANNED**

</div>

## Overview

Pa’l Jangueo brings upcoming music performances from multiple Puerto Rican ticketing platforms into a single searchable experience. Instead of visiting each provider separately, users can explore concerts by date, area, venue, artist, and price, then follow the official ticket link.

Created as a solo Holberton School final project in October 2026, the application remains an independent project in active development. The public beta demonstrates a working end-to-end system; it is not a finished commercial ticketing service.

## What the MVP does

- Aggregates eligible music listings from **Boletera**, **PRticket**, and **Ticket Center PR**.
- Provides Spanish-first navigation with an English language toggle.
- Supports search, calendar browsing, and filters for dates, regions, municipalities, neighborhoods, and price.
- Lets visitors save events in **Mi Jangueo** using browser storage, without an account.
- Displays event details, flyers or fallbacks, location links, and official ticket links.
- Runs scheduled source discovery and validation through GitHub Actions.
- Restricts the public feed to upcoming, published events at verified venues.

**Coverage is not guaranteed to be exhaustive or real-time.** The live catalog reflects the events the current discovery and review processes have successfully verified and published. Non-music, expired, conflicting, and insufficiently verified listings are excluded.

## Architecture

```text
Official event sources
        |
        v
Discovery adapters and extractors (Node.js)
        |
        v
Normalization, music eligibility and verification
        |
        v
Candidate staging and guarded publication
        |
        v
Supabase PostgreSQL
        |
        v
Express API (/api/events)
        |
        v
React + Vite frontend
```

Source information may have incomplete dates, inconsistent venue names, changing flyers, or several performances on one page. The backend validates these cases, checks for duplicates and conflicts, and keeps uncertain candidates out of the public feed until they meet the publication policy.

**AI-assisted processing:** Google Gemini can help analyze flyers and event descriptions. Its output is treated as evidence to review, not as proof that an event is correct. The source, venue, date, music classification, and publication safeguards remain separate checks.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React, Vite, JavaScript, CSS, Fuse.js |
| Backend | Node.js, Express |
| Database | PostgreSQL, Supabase |
| Source processing | Provider-specific JavaScript extractors and normalization utilities |
| AI assistance | Google Gemini (`@google/genai`) |
| Automation | GitHub Actions |
| Quality | Node.js test runner, Oxlint, Vite production builds |

## Repository

```text
pal-jangueo/
├── .github/workflows/  Scheduled discovery and scene-evaluation workflows
├── client/             Web app and frontend tests
├── database/           Schema history and database resources
├── docs/               Dated integration and editorial audit notes
└── server/             Express API, source processing, migrations and tests
```

The files in `database/` and `server/migrations/` document the database evolution; they are not automatically executed when the web client starts.

## Development setup

**Requirements:** Node.js 24, npm, a configured PostgreSQL database, and its trusted CA certificate. Certain optional processing scripts also need a Gemini API key. Install the schema appropriate to your development database before starting the API.

In `server/`:

```bash
npm ci
```

Configure `server/.env` locally:

```dotenv
DATABASE_URL=your_postgresql_connection_string
SUPABASE_CA_PATH=certs/supabase-ca.crt
CLIENT_ORIGINS=http://localhost:5173
PORT=3001
GEMINI_API_KEY=your_optional_key
```

Point `SUPABASE_CA_PATH` to a suitable CA file for the PostgreSQL connection. Never commit API keys, credentials, or private certificates.

```bash
npm run dev
```

In a separate terminal, from `client/`:

```bash
npm ci
```

Create `client/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001
```

```bash
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`, and Express uses port `3001` unless configured otherwise.

## Public API

| Endpoint | Description |
| --- | --- |
| `GET /api/events` | Upcoming, published events at verified venues, ordered by start date. Current API query has a 100-event limit. |
| `GET /api/health` | Backend process health. |
| `GET /api/db-health` | Database connectivity. |

These are read endpoints. New events are not scraped or approved in response to a visitor's search.

## Run checks

```bash
cd server && npm test
cd ../client && node --test tests/*.test.*
npm run lint
npm run build
```

Source ingestion, venue verification, publication review, and scheduled jobs are documented in the [backend guide](./server/README.md). Provider-specific historical audits remain in `docs/` with their original dates.

## Development status

This is an independently maintained MVP. Next steps include improving catalog coverage, reconciling provider updates, extending accessibility checks, and expanding artist and venue discovery. These are plans rather than current feature guarantees.

Ticket purchases and their final availability are handled by the original provider. Pa’l Jangueo is not an official ticketing platform for the third-party sources it references.

**Name and trademark:** Pa’l Jangueo is planned for a future trademark registration. This repository does not claim that an application has been filed or that registration has been granted.

## Author

Developed by **[Romeo González (RohMeOh)](https://github.com/RohMeOh)** as a Holberton School final project and continued independently.
