# ETF Viewer

Enter your ETF positions by **ISIN** (plus your **cash**) and see how your
portfolio is allocated — and what each fund actually holds.

## Status

| Iteration | Scope | State |
| --- | --- | --- |
| 1 | ETF + cash allocation (pie chart) | done |
| 2 | Fund metadata, top holdings, backend + SQLite persistence | **done** |
| 3 | Stock-level look-through across ETFs | planned |

- Iteration 1 details: [docs/iteration-01.md](./docs/iteration-01.md)
- Iteration 2 details: [docs/iteration-02.md](./docs/iteration-02.md)
- Full plan: [docs/roadmap.md](./docs/roadmap.md)
- Holdings-data research: [docs/data-sources.md](./docs/data-sources.md)

## Features

- Add an ETF (ISIN + optional name + EUR value) and multiple cash positions.
- Doughnut chart of the allocation; table with value and share of total.
- Positions persist in a **file-based SQLite database** via the backend API.
- Each ETF row resolves its **fund metadata** (name, TER, currency, holdings
  count) and expands to a read-only **top-holdings** list with the EUR exposure
  implied by the position.
- Fund data comes from the [FundFacts API](https://fundfactsapi.com) — ISIN-based,
  covering every fund house — with a bundled fallback snapshot and 24 h caching.

## Architecture

```
browser (Vite + TS)  ──/api──▶  backend (Express + SQLite)  ──▶  FundFacts API
```

The backend makes all upstream calls, so the browser never hits a foreign
origin (no CORS) and API keys stay on the server.

## Getting started

```bash
npm install
npm run dev      # backend on :3000, web on http://localhost:5173 (proxied)
```

No configuration needed: without an API key the backend uses FundFacts' keyless
demo endpoint. For higher limits, get a key and export it:

```bash
export FUNDFACTS_API_KEY=ffk_live_...
npm run dev
```

## Scripts

```bash
npm run dev        # backend + frontend together (watch mode)
npm run dev:server # backend only
npm run dev:web    # frontend only
npm run build      # typecheck + production frontend build (dist/)
npm run start      # backend only (no watch)
npm test           # vitest
npm run typecheck  # frontend + backend TypeScript
```

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness + fund-data mode |
| GET | `/api/positions` | list positions |
| POST | `/api/positions` | create position |
| PATCH | `/api/positions/:id` | update position |
| DELETE | `/api/positions/:id` | delete position |
| GET | `/api/funds/:isin` | fund metadata + top holdings |

## Configuration

| Env var | Default |
| --- | --- |
| `PORT` | `3000` |
| `DB_FILE` | `data/etf-viewer.sqlite` |
| `FUNDFACTS_API_KEY` | *(empty → keyless demo endpoint)* |
| `FUNDFACTS_BASE_URL` | `https://fundfactsapi.com/api/v1` |
| `FUND_CACHE_TTL_MS` | `86400000` (24 h) |
| `UPSTREAM_TIMEOUT_MS` | `30000` |
| `API_URL` | `http://localhost:3000` (Vite proxy target) |

The SQLite file lives in `data/` and is gitignored.

## Tech stack

Vite + TypeScript (strict) + Chart.js on the frontend; Express + better-sqlite3
on the backend. Vanilla DOM, no UI framework.

## Project layout

```
shared/            types + ISIN validation used by both sides
src/               frontend
  api.ts           fetch client for /api
  store.ts         positions state (server-backed)
  funds.ts         lazy fund-data lookup per ISIN
  ui.ts            DOM, form, table, holdings view
  calc.ts          allocation math (pure)
  chart.ts         Chart.js doughnut
server/            backend
  index.ts         Express app
  config.ts        env configuration
  db.ts            SQLite schema + position/fund-cache repositories
  routes/          positions + funds endpoints
  holdings/        HoldingsProvider interface, FundFacts, snapshot, FundService
docs/
  iteration-01.md  iteration-02.md  roadmap.md  data-sources.md
```
