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
  index.ts         Express app
  config.ts        env configuration
  db.ts            SQLite schema + position/fund-cache repositories
  routes/          positions + funds endpoints
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
  style.css        theme
index.html         Vite entry document
```

Tests are colocated `*.test.ts` next to the source they cover.

## Scripts

```bash
npm run dev        # backend + frontend together (watch mode)
npm run dev:server # backend only
npm run dev:web    # frontend only
npm run build      # typecheck + production frontend build (dist/)
npm run start      # backend only (no watch)
npm run preview    # serve the production build
npm test           # vitest run
npm run typecheck  # frontend (tsconfig) + backend (tsconfig.server) TypeScript
```

Always run `npm run typecheck` and `npm test` before considering work done;
`npm run build` for anything touching the frontend.

## Configuration

Backend reads env vars (see `server/config.ts`); no `.env` loader is wired up,
export them in the shell.

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

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness + fund-data mode |
| GET | `/api/positions` | list positions |
| POST | `/api/positions` | create position |
| PATCH | `/api/positions/:id` | update position |
| DELETE | `/api/positions/:id` | delete position |
| GET | `/api/funds/:isin` | fund metadata + top holdings |

A `Position` carries `kind`, `isin` (ETFs), `name`, `bank` and `interestRate`
(cash only) and `amount`. Validation lives in `server/routes/positions.ts`:
`kind ∈ {etf, cash}`, `amount > 0`, a structurally valid ISIN for ETFs, and a
non-negative `interestRate` when present.

## Key design decisions & gotchas

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
- **Schema is created with `CREATE TABLE IF NOT EXISTS`**, with explicit
  `ALTER TABLE` migrations for new columns (see `addColumn` in `db.ts`; `bank`
  and `interest_rate` were both added this way). Changing a table means adding a
  real migration — never rely on `CREATE TABLE` alone.
- **Tests**: colocated `*.test.ts`. Use `createDb(":memory:")` for repo tests;
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
