# ETF Viewer

Enter your ETF positions by ISIN plus your cash (value, bank and optional interest rate) and see
how the portfolio is allocated, what it actually holds, and how exposed you are to individual
stocks, sectors and countries.

## Features

- Doughnut chart of the portfolio allocation (ETF / cash).
- Fund metadata and top holdings per ISIN, with stale-cache and coverage badges.
- Look-through exposure: individual stocks aggregated across all ETFs, plus sector / country
  topic charts.
- Cash positions with a bank and optional interest rate.
- Multiple named portfolios: name the current one and start a new one, then switch between them
  from the picker in the header. Adding the same ISIN twice joins it into one position.
- Positions persisted server-side in SQLite; the browser only talks to same-origin `/api`.

## Architecture

```
browser (Vite + TS)  ──/api──▶  backend (Express + SQLite)  ──▶  FundFacts API
```

The backend owns validation, persistence, the API key, caching and the fund-data provider
abstraction, so the browser never calls a third-party origin. `shared/` holds the
platform-neutral domain logic used by both sides.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the backend and the Vite dev server together. Open the URL Vite prints and
add positions on the **Positions** tab.

Without an API key the backend uses [FundFacts'](https://fundfactsapi.com/) keyless demo
endpoint. For higher limits, get a key and set `FUNDFACTS_API_KEY`.

## Configuration

The backend reads environment variables (there is no `.env` loader — export them in your shell).
See [`.env.example`](./.env.example) for a copy-paste starting point.

| Variable                   | Default                           | Purpose                                      |
| -------------------------- | --------------------------------- | -------------------------------------------- |
| `PORT`                     | `3000`                            | Backend port.                                |
| `DB_FILE`                  | `data/etf-viewer.sqlite`          | SQLite file location.                        |
| `FUNDFACTS_API_KEY`        | _(empty)_                         | Empty uses the keyless demo endpoint.        |
| `FUNDFACTS_BASE_URL`       | `https://fundfactsapi.com/api/v1` | Upstream API base URL.                       |
| `FUND_CACHE_TTL_MS`        | `86400000` (24 h)                 | How long a cached fund payload stays fresh.  |
| `UPSTREAM_TIMEOUT_MS`      | `30000`                           | Upstream request timeout.                    |
| `ENABLE_SNAPSHOT_FALLBACK` | _(unset → off)_                   | Bundled fixture provider; testing/demo only. |
| `API_URL`                  | `http://localhost:3000`           | Vite dev proxy target for `/api`.            |

Configuration is validated at startup: an invalid port, timeout or URL fails fast instead of
silently misbehaving.

## Scripts

| Command                 | What it does                                      |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Backend + frontend in watch mode.                 |
| `npm run dev:server`    | Backend only.                                     |
| `npm run dev:web`       | Frontend only.                                    |
| `npm run build`         | Typecheck + production frontend build to `dist/`. |
| `npm run start`         | Backend only, no watch.                           |
| `npm run preview`       | Serve the production build.                       |
| `npm run type-check`    | TypeScript, frontend and backend projects.        |
| `npm run lint`          | Biome lint (`lint:fix` to apply safe fixes).      |
| `npm run format`        | Prettier write (`format:check` to verify).        |
| `npm test`              | Vitest run.                                       |
| `npm run test:coverage` | Vitest with a v8 coverage report and a 90% gate.  |
| `npm run check`         | Type-check + lint + tests.                        |

## HTTP API

| Method | Path                  | Purpose                       |
| ------ | --------------------- | ----------------------------- |
| GET    | `/api/health`         | Liveness + fund-data mode.    |
| GET    | `/api/portfolios`     | List portfolios.              |
| POST   | `/api/portfolios`     | Create a portfolio.           |
| PATCH  | `/api/portfolios/:id` | Rename a portfolio.           |
| GET    | `/api/positions`      | List positions.               |
| POST   | `/api/positions`      | Create (or join) a position.  |
| PATCH  | `/api/positions/:id`  | Update a position.            |
| DELETE | `/api/positions/:id`  | Delete a position.            |
| GET    | `/api/funds/:isin`    | Fund metadata + top holdings. |

Every `Position` belongs to a `Portfolio` via `portfolioId`. `GET /api/positions` accepts an
optional `?portfolioId=` filter and `POST /api/positions` takes a `portfolioId` in the body
(defaulting to the seeded portfolio). Posting an ETF ISIN that already exists in the portfolio
sums the amount into the existing row instead of creating a duplicate.

A `Position` has a `kind` (`etf` or `cash`), an `isin` (ETFs), a `name`, a `bank` and
`interestRate` (cash), and an `amount` in EUR. `PATCH` accepts partial bodies; sending
`"interestRate": null` clears the rate. Invalid input is rejected with `400`.

## Testing

Tests are colocated `*.test.ts` files. Repo and provider tests use an in-memory SQLite database
and injected fake providers/clients instead of hitting the network. Frontend state and UI are
tested with Vitest + jsdom (canvas is mocked). `npm run test:coverage` enforces 90% line,
branch, function and statement coverage and writes a `coverage/` report.
