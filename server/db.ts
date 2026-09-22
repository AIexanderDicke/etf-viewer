import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AssetKind, FundInfo, Portfolio, Position, PositionInput } from "../shared/types.ts";
import { config } from "./config.ts";

export type Db = Database.Database;

export function createDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL CHECK (kind IN ('etf', 'cash')),
      isin       TEXT NOT NULL DEFAULT '',
      name       TEXT NOT NULL DEFAULT '',
      amount     REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_cache (
      isin       TEXT PRIMARY KEY,
      payload    TEXT NOT NULL,
      source     TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // Cash positions gained a bank and an interest rate; positions are stored
  // with CREATE TABLE IF NOT EXISTS, so existing databases need the columns
  // added explicitly.
  addColumn(db, "positions", "bank", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "positions", "interest_rate", "REAL");

  // Portfolios were added later; existing positions are attached to the
  // seeded default portfolio so no data is orphaned.
  addColumn(db, "positions", "portfolio_id", "TEXT NOT NULL DEFAULT ''");
  const fallback = ensureDefaultPortfolio(db);
  db.prepare("UPDATE positions SET portfolio_id = ? WHERE portfolio_id = ''").run(fallback.id);
}

function addColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

interface PortfolioRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function toPortfolio(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns the oldest portfolio, creating an unnamed one when none exists. */
export function ensureDefaultPortfolio(db: Db): Portfolio {
  const row = db.prepare("SELECT * FROM portfolios ORDER BY created_at ASC LIMIT 1").get() as
    PortfolioRow | undefined;
  if (row) return toPortfolio(row);

  const now = new Date().toISOString();
  const portfolio: Portfolio = {
    id: crypto.randomUUID(),
    name: "",
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO portfolios (id, name, created_at, updated_at)
     VALUES (@id, @name, @createdAt, @updatedAt)`,
  ).run(portfolio);
  return portfolio;
}

export interface PortfolioRepo {
  list(): Portfolio[];
  get(id: string): Portfolio | null;
  /** Case-insensitive lookup by trimmed name, optionally ignoring one id. */
  findByName(name: string, excludeId?: string): Portfolio | null;
  create(name?: string): Portfolio;
  update(id: string, patch: { name: string }): Portfolio | null;
  /** The default portfolio (oldest, seeded on demand). */
  default(): Portfolio;
}

/** The smallest unused "Portfolio N" name. */
function nextDefaultPortfolioName(db: Db): string {
  const rows = db.prepare("SELECT name FROM portfolios").all() as Array<{ name: string }>;
  const taken = new Set(rows.map((row) => row.name.trim().toLowerCase()));
  let index = 1;
  while (taken.has(`portfolio ${index}`)) index += 1;
  return `Portfolio ${index}`;
}

export function createPortfolioRepo(db: Db): PortfolioRepo {
  return {
    list() {
      const rows = db
        .prepare("SELECT * FROM portfolios ORDER BY created_at ASC")
        .all() as PortfolioRow[];
      return rows.map(toPortfolio);
    },

    get(id) {
      const row = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(id) as
        PortfolioRow | undefined;
      return row ? toPortfolio(row) : null;
    },

    findByName(name, excludeId) {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const row = db
        .prepare(
          `SELECT * FROM portfolios
           WHERE lower(name) = lower(?) AND id != ?
           LIMIT 1`,
        )
        .get(trimmed, excludeId ?? "") as PortfolioRow | undefined;
      return row ? toPortfolio(row) : null;
    },

    create(name = "") {
      const now = new Date().toISOString();
      const portfolio: Portfolio = {
        id: crypto.randomUUID(),
        name: name.trim() || nextDefaultPortfolioName(db),
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO portfolios (id, name, created_at, updated_at)
         VALUES (@id, @name, @createdAt, @updatedAt)`,
      ).run(portfolio);
      return portfolio;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) return null;
      const next: Portfolio = {
        ...existing,
        name: patch.name.trim(),
        updatedAt: new Date().toISOString(),
      };
      db.prepare("UPDATE portfolios SET name = @name, updated_at = @updatedAt WHERE id = @id").run(
        next,
      );
      return next;
    },

    default() {
      return ensureDefaultPortfolio(db);
    },
  };
}

let defaultDb: Db | undefined;

export function getDb(): Db {
  if (!defaultDb) defaultDb = createDb(config.dbFile);
  return defaultDb;
}

export interface ClearResult {
  portfolios: number;
  positions: number;
  funds: number;
}

/** Deletes stored data. `cacheOnly` leaves portfolios and positions untouched. */
export function clearDatabase(db: Db, { cacheOnly = false } = {}): ClearResult {
  return db.transaction((): ClearResult => {
    const funds = db.prepare("DELETE FROM fund_cache").run().changes;
    if (cacheOnly) return { portfolios: 0, positions: 0, funds };
    const positions = db.prepare("DELETE FROM positions").run().changes;
    const portfolios = db.prepare("DELETE FROM portfolios").run().changes;
    return { portfolios, positions, funds };
  })();
}

interface PositionRow {
  id: string;
  portfolio_id: string;
  kind: AssetKind;
  isin: string;
  name: string;
  bank: string;
  interest_rate: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

function toPosition(row: PositionRow): Position {
  return {
    id: row.id,
    portfolioId: row.portfolio_id ?? "",
    kind: row.kind,
    isin: row.isin,
    name: row.name,
    bank: row.bank ?? "",
    interestRate: row.interest_rate ?? undefined,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The portfolio a position without an explicit one should attach to. */
function defaultPortfolioId(db: Db): string {
  return ensureDefaultPortfolio(db).id;
}

export interface PositionRepo {
  /** Lists positions, optionally limited to a single portfolio. */
  list(portfolioId?: string): Position[];
  get(id: string): Position | null;
  /** First ETF position with this ISIN inside the portfolio, if any. */
  findByIsin(portfolioId: string, isin: string): Position | null;
  create(input: PositionInput, portfolioId?: string): Position;
  update(id: string, patch: Partial<PositionInput>): Position | null;
  remove(id: string): boolean;
}

export function createPositionRepo(db: Db): PositionRepo {
  return {
    list(portfolioId) {
      const rows = (
        portfolioId
          ? db
              .prepare("SELECT * FROM positions WHERE portfolio_id = ? ORDER BY created_at ASC")
              .all(portfolioId)
          : db.prepare("SELECT * FROM positions ORDER BY created_at ASC").all()
      ) as PositionRow[];
      return rows.map(toPosition);
    },

    get(id) {
      const row = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as
        PositionRow | undefined;
      return row ? toPosition(row) : null;
    },

    findByIsin(portfolioId, isin) {
      const row = db
        .prepare(
          `SELECT * FROM positions
           WHERE portfolio_id = ? AND kind = 'etf' AND isin = ?
           ORDER BY created_at ASC LIMIT 1`,
        )
        .get(portfolioId, isin) as PositionRow | undefined;
      return row ? toPosition(row) : null;
    },

    create(input, portfolioId) {
      const now = new Date().toISOString();
      const position: Position = {
        id: crypto.randomUUID(),
        portfolioId: portfolioId ?? defaultPortfolioId(db),
        kind: input.kind,
        isin: input.isin ?? "",
        name: input.name ?? "",
        bank: input.bank ?? "",
        interestRate: input.interestRate,
        amount: input.amount,
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO positions (id, portfolio_id, kind, isin, name, bank, interest_rate, amount, created_at, updated_at)
         VALUES (@id, @portfolioId, @kind, @isin, @name, @bank, @interestRate, @amount, @createdAt, @updatedAt)`,
      ).run({ ...position, interestRate: position.interestRate ?? null });
      return position;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) return null;
      const next: Position = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAt: new Date().toISOString(),
      };
      db.prepare(
        `UPDATE positions
         SET kind = @kind, isin = @isin, name = @name, bank = @bank,
             interest_rate = @interestRate, amount = @amount, updated_at = @updatedAt
         WHERE id = @id`,
      ).run({ ...next, interestRate: next.interestRate ?? null });
      return next;
    },

    remove(id) {
      return db.prepare("DELETE FROM positions WHERE id = ?").run(id).changes > 0;
    },
  };
}

export interface CachedFund {
  info: FundInfo;
  fetchedAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface FundCacheRepo {
  get(isin: string): CachedFund | null;
  set(isin: string, info: FundInfo, ttlMs: number): void;
  clear(isin?: string): void;
}

interface FundCacheRow {
  payload: string;
  source: string;
  fetched_at: string;
  expires_at: string;
}

export function createFundCacheRepo(db: Db, now: () => number = Date.now): FundCacheRepo {
  return {
    get(isin) {
      const row = db.prepare("SELECT * FROM fund_cache WHERE isin = ?").get(isin) as
        FundCacheRow | undefined;
      if (!row) return null;
      return {
        info: JSON.parse(row.payload) as FundInfo,
        fetchedAt: row.fetched_at,
        expiresAt: row.expires_at,
        expired: Date.parse(row.expires_at) <= now(),
      };
    },

    set(isin, info, ttlMs) {
      const fetchedAt = new Date(now()).toISOString();
      const expiresAt = new Date(now() + ttlMs).toISOString();
      db.prepare(
        `INSERT INTO fund_cache (isin, payload, source, fetched_at, expires_at)
         VALUES (@isin, @payload, @source, @fetchedAt, @expiresAt)
         ON CONFLICT(isin) DO UPDATE SET
           payload = excluded.payload,
           source = excluded.source,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`,
      ).run({
        isin,
        payload: JSON.stringify(info),
        source: info.source,
        fetchedAt,
        expiresAt,
      });
    },

    clear(isin) {
      if (isin) db.prepare("DELETE FROM fund_cache WHERE isin = ?").run(isin);
      else db.prepare("DELETE FROM fund_cache").run();
    },
  };
}
