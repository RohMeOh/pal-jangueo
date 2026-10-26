# Pa'l Jangueo

**Discover Puerto Rico's live music scene.**

Pa'l Jangueo is a full-stack web application that brings together live music events from Puerto Rican ticketing platforms. Its goal is to make local music easier to discover while helping artists and venues reach their audiences.

## Project Status

**MVP / Technical Demonstration — October 2026**

The current MVP supports event discovery from Boletera and PRticket. Events must pass validation checks before appearing in the public catalog.

Additional features are planned for future development.

## Features

- Live music event listings from Boletera and PRticket
- Search by event, artist, venue, or location
- Region, municipality, and neighborhood filters
- Date range and ticket price filters
- Event posters with fallback artwork
- Links to official ticketing pages
- Map links for event locations
- Responsive interface designed for desktop and mobile
- Automated event discovery and controlled publication

## Tech Stack

**Frontend:** React, Vite, JavaScript, CSS

**Backend:** Node.js, Express

**Database:** PostgreSQL (Supabase)

**Automation:** GitHub Actions

## Project Structure

```text
pal-jangueo/
├── client/       React frontend
├── server/       Express API and event processing
├── database/     Database schema and migrations
└── .github/      Automated discovery workflows
```

## Local Development

Requirements: Node.js 24, npm, and access to a PostgreSQL database configured with the project schema.

### Backend

```bash
cd server
npm ci
```

Create `server/.env` with the required configuration:

```env
DATABASE_URL=your_postgresql_connection_string
SUPABASE_CA_PATH=certs/supabase-ca.crt
CLIENT_ORIGINS=http://localhost:5173
PORT=3001
```

Provide the corresponding database CA certificate at the configured path.

Start the backend:

```bash
npm run dev
```

### Frontend

Open another terminal:

```bash
cd client
npm ci
```

Create `client/.env.local`:

```env
VITE_API_URL=http://localhost:3001
```

Start the frontend:

```bash
npm run dev
```

## API

- `GET /api/events` — Returns published, upcoming events at verified venues.
- `GET /api/health` — Backend health check.
- `GET /api/db-health` — Database connection check.

## Validation

Run backend tests:

```bash
cd server
npm test
```

Build the frontend:

```bash
cd client
npm run build
```

Event publication verifies official sources, event dates, music evidence, venues, and potential duplicates. Candidates that do not meet publication requirements remain pending review.

## Roadmap

- Expanded ticketing source coverage
- Artist and venue profile pages
- Mi Jangueo favorites and personalized recommendations
- Additional discovery and accessibility improvements

## Disclaimer

Pa'l Jangueo is an independent educational project. Ticket purchases take place through the original ticketing providers. Event information and availability may change at the source.

## Author

Developed by [RohMeOh](https://github.com/RohMeOh) as a Holberton School final project.
