# AGENTS.md — etf-viewer

Project context for agents working in this repo. For container/environment
details (proto, git identity, persistence, workspace layout) see the workspace
guide at `/workspaces/dev/AGENTS.md`; this file is about the project itself.

## What this is

A small web app where a user enters their **ETF positions by ISIN** plus a
**cash** position (values in EUR) and sees:

1. a doughnut chart of the allocation (ETF / cash shares of the total),
2. each fund's metadata and top holdings,
3. a **look-through**: individual stocks and topics (sector / country / region /
   asset class) aggregated across all ETFs.

Positions persist server-side. A backend proxies the fund-data API so the
browser never calls a third-party origin and the API key stays on the server.

## Status

| Iteration | Scope | State |
| --- | --- | --- |
| 1 | ETF + cash allocation pie chart | done |
| 2 | Fund metadata, top holdings, backend + SQLite persistence | done |
| 3 | Stock + topic look-through across ETFs | done |
| 4 | Editing, multiple portfolios, import/export | planned |
| 5 | Live prices & currencies | planned |
| 6 | Analytics & rebalancing | planned |

Design docs live in `docs/` (see the roadmap there). They are intentionally
**not tracked by git** in this repo.

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

### Directory map

```
shared/            both sides, pure
  types.ts         domain types (Position, FundInfo, Breakdowns, LookThrough…)
  isin.ts          ISIN structural validation
  portfolio.ts     isUsable / summarize (allocation math)
  exposure.ts      computeLookThrough (look-through aggregation)
src/               frontend (Vite, strict TS, vanilla DOM, Chart.js)
  api.ts           typed fetch client for /api
  store.ts         positions state (server-backed, subscribe/notify)
  funds.ts         lazy per-ISIN fund lookup with its own subscribers
  ui.ts            tab shell, form, position table, fund rows
  lookthrough.ts   look-through view (stock table, topic switch, doughnut)
  chart.ts         reusable Chart.js doughnut factory
  calc.ts          re-exports shared portfolio helpers (compat)
server/            backend (Express + better-sqlite3, run with tsx)
  index.ts         app wiring + listen
  config.ts        env configuration
  db.ts            SQLite schema + position & fund-cache repositories
  routes/          positions.ts, funds.ts
  holdings/        types.ts (HoldingsProvider), fundfacts.ts, snapshot.ts,
                   service.ts (FundService: cache + provider fallback)
```

## Commands

```bash
npm run dev        # backend :3000 + web :5173 (proxy) together
npm run dev:server # backend only (tsx watch)
npm run dev:web    # frontend only
npm test           # vitest (unit tests)
npm run typecheck  # tsc for frontend AND backend (two tsconfigs)
npm run build      # typecheck + production frontend build → dist/
npm run start      # backend only, no watch
```

Always run `npm run typecheck` and `npm test` before considering work done;
`npm run build` for anything touching the frontend.

## Configuration

Backend reads env vars (see `server/config.ts`); no `.env` loader is wired up,
export them in the shell.

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | backend port |
| `DB_FILE` | `data/etf-viewer.sqlite` | SQLite file (gitignored) |
| `FUNDFACTS_API_KEY` | *(empty)* | authenticated FundFacts endpoint; empty = keyless demo |
| `FUNDFACTS_BASE_URL` | `https://fundfactsapi.com/api/v1` | provider base |
| `FUND_CACHE_TTL_MS` | `86400000` | fund cache TTL (24 h) |
| `UPSTREAM_TIMEOUT_MS` | `30000` | upstream request timeout |
| `API_URL` | `http://localhost:3000` | Vite dev proxy target |

## HTTP API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | liveness + fund-data mode |
| GET | `/api/positions` | list |
| POST | `/api/positions` | `{kind, isin, name, amount}`; 400 on bad input |
| PATCH | `/api/positions/:id` | partial update |
| DELETE | `/api/positions/:id` | delete |
| GET | `/api/funds/:isin` | `FundInfo`: metadata, top holdings, breakdowns; 404 if unknown |

Validation lives in `server/routes/positions.ts`: `kind ∈ {etf, cash}`,
`amount > 0`, and a structurally valid ISIN for ETFs.

## Key design decisions & gotchas

- **Data source is FundFacts** (ISIN-first, one schema for all fund houses).
  Without a key the backend uses its keyless demo endpoint. See
  `docs/data-sources.md` for why issuer endpoints and ticker-only APIs were
  rejected. Never hard-code an issuer-specific source.
- **`HoldingsProvider`** is the seam (`server/holdings/types.ts`): providers
  return `null` for "unknown", throw on transient failure. `FundService` walks
  providers in order (FundFacts → bundled snapshot) and prefers a **stale**
  cache entry over a hard failure (flagged `stale`).
- **Top holdings are only ~10 rows** (≈27% of a broad index fund), while
  sector/country breakdowns are near-complete. The look-through must always
  surface coverage and reconcile with explicit `Cash` / `Other holdings` /
  `Not resolved yet` rows. Tests assert `stocks + cash + unclassified +
  unresolved === total`.
- **Stock identity** is merged by ISIN → ticker → normalised name. Keep that
  order; the name normaliser strips legal suffixes so `APPLE` == `APPLE INC`.
- **Keep aggregation pure** in `shared/exposure.ts`. If it needs to move
  server-side later, it already can.
- **Schema is created with `CREATE TABLE IF NOT EXISTS`** — there is no
  migration tool yet. Changing a table means adding a real migration.
- **Tests**: `*.test.ts` colocated with source. `createDb(":memory:")` for repo
  tests; inject a fake `fetch`/providers rather than hitting the network.
- Fund cache is keyed by ISIN; if you change the `FundInfo` shape, clear
  `data/` (or the `fund_cache` table) or old payloads will lack new fields.
- Amounts are EUR; weights are percentages (0–100) everywhere.

## Conventions

- Strict TypeScript; `noUnusedLocals`/`noUnusedParameters` are on.
- ESM only (`"type": "module"`); relative imports use explicit `.ts` extensions.
- No UI framework — vanilla DOM built with small helpers (`el`, `get`).
- No comments unless they explain a non-obvious decision.
- Do not commit unless explicitly asked, and never commit the `docs/` directory.
