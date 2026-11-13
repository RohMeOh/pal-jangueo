# Pa’l Jangueo — Backend

The Node.js and Express backend for Puerto Rico music-event discovery. It serves the published catalog and contains the workflows that collect, normalize, validate, stage, and publish event information from supported sources.

[Project overview](../README.md) · [Frontend guide](../client/README.md)

## How it works

1. **Discover:** Provider-specific scripts examine official listings from Boletera, PRticket, and Ticket Center PR.
2. **Normalize:** Dates, venues, performers, sources, prices, and performance counts are interpreted conservatively.
3. **Stage:** Eligible source records are saved as review candidates while preserving source evidence and content fingerprints.
4. **Verify:** The publication policy checks music-first evidence, future dates, approved sources and venues, conflicts, and duplicates.
5. **Publish:** Guarded publication scripts create visible events only when the relevant conditions are satisfied. Uncertain or changed information remains subject to review.
6. **Serve:** The Express API returns upcoming published events associated with verified venues.

The automation is designed to avoid duplicate listings and unsupported publication. A successful workflow does not imply that every source entry was published.

## Stack and layout

- `index.js` defines the Express server, CORS configuration, and health endpoints.
- `db.js` creates a PostgreSQL connection pool using the configured CA certificate.
- `routes/events.js` implements the public event feed.
- `adapters/` contains source and venue adapters.
- `scripts/` contains scheduled and operator-invoked discovery, audit, staging, and publication tasks. Some scripts are one-time or source-specific maintenance tools.
- `utils/` holds reusable parsing, normalization, eligibility, and validation code.
- `test/` and `tests/` hold Node.js tests. Both suites are part of `npm test`.
- `migrations/` tracks additional database schema changes.

## Local development

Use Node.js 24 and npm. From `server/`:

```bash
npm ci
```

Set `.env` locally with these values:

```dotenv
DATABASE_URL=your_postgresql_connection_string
SUPABASE_CA_PATH=certs/supabase-ca.crt
CLIENT_ORIGINS=http://localhost:5173
PORT=3001
GEMINI_API_KEY=your_optional_key
```

Set `SUPABASE_CA_PATH` to a trusted CA file accessible to the backend process. Never commit credentials, private keys, or `.env` files.

```bash
npm run dev
```

## Public API

| Route | Description |
| --- | --- |
| `GET /api/health` | Express process check |
| `GET /api/db-health` | Database connectivity check |
| `GET /api/events` | Future published and scheduled music events at verified venues, ordered chronologically; currently limited to 100 rows |

The API only reads published data. It does not scrape provider websites or process events on a user's request.

## Automated discovery

The `.github/workflows/discovery.yml` workflow is scheduled and also supports manual execution. It runs backend validation and the source-discovery pipeline. Each provider has its own parsing and publication checks; not every successful run creates new events. Publication depends on the workflow configuration and the candidate passing every guard.

The separate `scene-evaluation.yml` workflow performs a review of independent scene relevance. This is not a replacement for music-first or venue verification.

Do not use `--publish`, `--apply`, or other write flags when simply inspecting a candidate. The relevant scripts support read-only checks or simulations; inspect their usage and output before running a write operation. Manual review is appropriate for uncertain or changed source evidence.

## Tests

```bash
npm test
```

This executes both `tests/*.test.js` and `test/*.test.js`. The suite covers source parsing, venue verification, music-first eligibility, date handling, deduplication, and other guards. When changing a provider extractor, add a regression test using a realistic provider fragment.

## Historical data and audits

The `database/` and `migrations/` directories record schema changes. The dated notes in `docs/` describe past catalog snapshots and should not be read as current availability counts.

This backend is part of a beta MVP. Source coverage, editorial review, and provider updates remain active maintenance responsibilities.
