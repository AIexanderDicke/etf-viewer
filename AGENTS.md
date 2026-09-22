# AGENTS.md — etf-viewer

Project context for agents working in this repo.

## What this is

A small web app where a user enters their **ETF positions by ISIN** plus one or
more **cash** positions (value in EUR, plus a bank and optional interest rate)
and sees:

1. a doughnut chart of the allocation (ETF / cash shares of the total),
2. each fund's metadata and top holdings,
3. an **exposure** view: individual stocks and topics (sector / country)
   aggregated across all ETFs.

The UI has three tabs — **Portfolio** (chart + legend), **Exposure**
(`lookthrough.ts`) and **Positions** (add form + table; id `config` in code).
Positions persist server-side. A backend proxies the fund-data API so the
browser never calls a third-party origin and the API key stays on the server.

## Architecture

```
browser (Vite + TS)  ──/api──▶  backend (Express + SQLite)  ──▶  FundFacts API
```

- The frontend only ever calls same-origin `/api/*`. Vite proxies `/api` to the
  backend in dev (`API_URL`, default `http://localhost:3000`).
- The backend owns validation, persistence, the API key, caching and the
  provider abstraction. Do **not** add direct third-party fetches to the client.
- `shared/` is imported by both sides and must stay platform-neutral (no DOM,
  no Node APIs).

## Project layout

```
shared/            used by both sides
  types.ts         domain types (positions, funds, breakdowns, look-through)
  isin.ts          ISIN validation
  portfolio.ts     isUsable / summarize (allocation math)
  exposure.ts      pure look-through aggregation
server/            backend
  app.ts           Express app factory (createApp), error handling
  index.ts         bootstrap: db, providers, listen, graceful shutdown
  config.ts        env configuration (validated at startup)
  db.ts            SQLite schema + position/fund-cache repositories
  routes/          portfolios + positions + funds endpoints
  holdings/        HoldingsProvider interface, FundFacts, snapshot, FundService
src/               frontend
  main.ts          entry point, mounts the app
  api.ts           fetch client for /api
  store.ts         positions state (server-backed)
  funds.ts         lazy fund-data lookup per ISIN
  ui.ts            tab shell, add-position form, position table, fund rows
  lookthrough.ts   exposure view (stocks + topic charts)
  calc.ts          re-exports shared portfolio/ISIN helpers
  chart.ts         Chart.js doughnut factories
  format.ts        euro / percent / integer formatters
  export.ts        allocation PNG export (chart + allocation table)
  transfer.ts      portfolio JSON export / import (import creates a new portfolio)
  style.css        theme
index.html         Vite entry document
tests/             all `*.test.ts`, mirroring the source layout
  shared/            tests for shared/
  server/            tests for server/
  src/               tests for src/
Dockerfile         slim multi-stage production image
.dockerignore      keeps tests, data and build output out of the image context
```

Tests live under `tests/`, mirroring the `shared/` / `server/` / `src/` layout;
they import production code with relative `../../…` paths. Tooling config lives
in `biome.json`, `.prettierrc.json`, `vitest.config.ts` and `tsconfig.test.json`.

## Scripts

```bash
npm run dev            # backend + frontend together (watch mode)
npm run dev:server     # backend only
npm run dev:web        # frontend only
npm run build          # typecheck + production frontend build (dist/)
npm run start          # backend only (no watch)
npm run db:clear       # delete all portfolios, positions and cached funds (--cache: funds only)
npm run preview        # serve the production build
npm test               # vitest run
npm run test:coverage  # vitest + v8 coverage with a 90% gate (writes coverage/)
npm run typecheck      # frontend (tsconfig) + backend (tsconfig.server) + tests (tsconfig.test)
npm run type-check     # alias of typecheck
npm run lint           # biome lint (lint:fix to apply safe fixes)
npm run format         # prettier --write (format:check to verify)
npm run check          # type-check + lint + tests
```

Always run `npm run type-check`, `npm run lint` and `npm test` before considering
work done; `npm run test:coverage` when touching tested logic; `npm run build`
for anything touching the frontend.

Linting is **Biome** (typescript-eslint does not support the native TypeScript 7
compiler this repo uses) and formatting is **Prettier** (`printWidth: 100`).

## Docker

`Dockerfile` is a slim multi-stage build on `node:24-alpine`:

1. **build** installs all deps, typechecks the production tsconfigs and runs
   `vite build`, then `npm prune --omit=dev`.
2. **runtime** copies only `node_modules`, `dist/`, `shared/`, `server/` and
   `package.json`, then starts `node server/index.ts`.

Node runs the TypeScript backend directly (type stripping), so there is no
compiled server and `tsx` never ships. Tests are never copied into the image
(explicit `COPY` plus `.dockerignore`). The SQLite database lives on a volume at
`/data` (`DB_FILE=/data/etf-viewer.sqlite`), and the image defaults to
`NODE_ENV=production` and `PORT=3000`. The process runs as the non-root `node`
user and serves the built SPA and `/api` from one port.

```bash
docker build -t etf-viewer .
docker run --rm -p 3000:3000 -v etf-viewer-data:/data etf-viewer
```

## Configuration

Backend reads env vars (see `server/config.ts`); no `.env` loader is wired up,
export them in the shell. `.env.example` is a copy-paste template. Invalid values
fail fast at startup.

| Env var                    | Default                                     |
| -------------------------- | ------------------------------------------- |
| `PORT`                     | `3000`                                      |
| `DB_FILE`                  | `data/etf-viewer.sqlite`                    |
| `FUNDFACTS_API_KEY`        | _(empty → keyless demo endpoint)_           |
| `FUNDFACTS_BASE_URL`       | `https://fundfactsapi.com/api/v1`           |
| `FUND_CACHE_TTL_MS`        | `86400000` (24 h)                           |
| `UPSTREAM_TIMEOUT_MS`      | `30000`                                     |
| `ENABLE_SNAPSHOT_FALLBACK` | _(unset → off; testing/demo only)_          |
| `API_URL`                  | `http://localhost:3000` (Vite proxy target) |

The SQLite file lives in `data/` and is gitignored.

## HTTP API

| Method | Path                  | Purpose                      |
| ------ | --------------------- | ---------------------------- |
| GET    | `/api/health`         | liveness + fund-data mode    |
| GET    | `/api/portfolios`     | list portfolios              |
| POST   | `/api/portfolios`     | create portfolio             |
| PATCH  | `/api/portfolios/:id` | rename portfolio             |
| GET    | `/api/positions`      | list positions               |
| POST   | `/api/positions`      | create / join position       |
| PATCH  | `/api/positions/:id`  | update position              |
| DELETE | `/api/positions/:id`  | delete position              |
| GET    | `/api/funds/:isin`    | fund metadata + top holdings |

A `Position` carries `portfolioId`, `kind`, `isin` (ETFs), `name`, `bank` and
`interestRate` (cash only) and `amount`. Validation lives in
`server/routes/positions.ts`: `kind ∈ {etf, cash}`, `amount > 0`, a structurally
valid ISIN for ETFs, and a non-negative `interestRate` when present.

## Key design decisions & gotchas

- **Portfolios** are the top-level container: every position has a
  `portfolioId`. The backend seeds an unnamed default portfolio and attaches
  pre-existing rows to it (`ensureDefaultPortfolio`). The header has a picker, an
  inline name field with a Save button that renames the active portfolio, and a
  "Start new portfolio" button that creates an auto-numbered `Portfolio N`.
  Names are unique case-insensitively
  and duplicates are rejected (409); a soft warning shows while the default name
  is kept. The selection is remembered in `localStorage`.
- **Duplicate ETF ISINs are joined** inside a portfolio: POSTing an ISIN that
  already exists sums the amount into the existing row (one row per ISIN per
  portfolio) instead of creating a second position. Cash positions stay separate.
- **Data source is FundFacts** (ISIN-first, one schema for all fund houses).
  Without a key the backend uses its keyless demo endpoint. Never hard-code an
  issuer-specific source.
- **`HoldingsProvider`** is the seam (`server/holdings/types.ts`): providers
  return `null` for "unknown", throw on transient failure. `FundService` walks
  providers in order (FundFacts → bundled snapshot) and prefers a **stale**
  cache entry over a hard failure (flagged `stale`).
- **Holdings coverage varies by fund**: the provider returns whatever the fund
  house publishes — ETFs usually file the full list, many active funds only
  their top ten. Coverage is always surfaced, and the exposure view reconciles
  with explicit `Cash` / `Other holdings` / `Not resolved yet` rows. Tests
  assert `stocks + cash + unclassified + unresolved === total`.
- **Stock identity** is merged by ISIN → ticker → normalised name. Keep that
  order; the name normaliser strips legal suffixes so `APPLE` == `APPLE INC`.
- **Keep aggregation pure** in `shared/exposure.ts`. If it needs to move
  server-side later, it already can.
- **The backend can serve the built frontend**: `createApp` accepts an optional
  `staticDir`; `server/index.ts` passes `dist/` when `dist/index.html` exists, so
  one production container serves both the SPA and `/api`. In dev it stays unset
  and Vite serves the UI.
- **Every database change ships with a migration (mandatory).** Schema is
  created with `CREATE TABLE IF NOT EXISTS`, and any change to persisted data —
  a new table, column or index, a backfill, a rename — must add an idempotent
  migration to `migrate()` in `server/db.ts` that upgrades existing databases
  (see `addColumn`; `bank`, `interest_rate` and `portfolio_id` were all added
  this way). Never rely on `CREATE TABLE` alone, and never assume a fresh
  database. Add a test under `tests/server/db.test.ts` that seeds the old shape
  and asserts the migration leaves no data orphaned.
- **Tests**: all `*.test.ts` live under `tests/` (never colocated, so they can
  be excluded from the Docker image). Use `createDb(":memory:")` for repo tests;
  inject a fake `fetch`/providers rather than hitting the network.
- Fund cache is keyed by ISIN; if you change the `FundInfo` shape, clear
  `data/` (or the `fund_cache` table) or old payloads will lack new fields.
- Amounts are EUR; weights are percentages (0–100) everywhere.

## Conventions

- Strict TypeScript; `noUnusedLocals`/`noUnusedParameters` are on.
- ESM only (`"type": "module"`); relative imports use explicit `.ts` extensions.
- No UI framework — vanilla DOM built with small `el`/`get` helpers (each view
  defines its own copies).
- Format money and shares with `src/format.ts` (`euro`, `percent`, `integer`);
  don't hand-roll `Intl` calls.
- No comments unless they explain a non-obvious decision.

## Git workflow (mandatory)

- **Prefer many small commits** over one large one. Commit logical steps as you
  go — each commit should build/pass on its own where feasible.
- **Conventional Commits are mandatory.** Use the type prefix (with an optional
  scope): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`,
  e.g. `feat(catalog): per-request language parameter`. No other commit-message
  style.
