import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, createFundCacheRepo, createPositionRepo, type Db } from "./db.ts";

describe("position repo", () => {
  let db: Db;
  let repo: ReturnType<typeof createPositionRepo>;

  beforeEach(() => {
    db = createDb(":memory:");
    repo = createPositionRepo(db);
  });

  it("creates, lists and reads positions", () => {
    const created = repo.create({ kind: "etf", isin: "IE00B4L5Y983", name: "World", amount: 1000 });

    expect(created.id).toBeTruthy();
    expect(repo.list()).toHaveLength(1);
    expect(repo.get(created.id)?.isin).toBe("IE00B4L5Y983");
  });

  it("stores a cash position's bank and interest rate", () => {
    const created = repo.create({
      kind: "cash",
      isin: "",
      name: "",
      bank: "Deutsche Bank",
      interestRate: 2.5,
      amount: 5000,
    });

    const stored = repo.get(created.id);
    expect(stored?.bank).toBe("Deutsche Bank");
    expect(stored?.interestRate).toBe(2.5);

    const updated = repo.update(created.id, { bank: "ING", interestRate: 3.1 });
    expect(updated?.bank).toBe("ING");
    expect(updated?.interestRate).toBe(3.1);
  });

  it("leaves bank empty and interest rate undefined by default", () => {
    const created = repo.create({ kind: "cash", isin: "", name: "", amount: 100 });
    expect(created.bank).toBe("");
    expect(created.interestRate).toBeUndefined();
    expect(repo.get(created.id)?.interestRate).toBeUndefined();
  });

  it("updates a position", () => {
    const created = repo.create({ kind: "cash", isin: "", name: "", amount: 100 });
    const updated = repo.update(created.id, { amount: 250 });

    expect(updated?.amount).toBe(250);
    expect(repo.get(created.id)?.amount).toBe(250);
  });

  it("returns null when updating a missing position", () => {
    expect(repo.update("nope", { amount: 1 })).toBeNull();
  });

  it("removes a position", () => {
    const created = repo.create({ kind: "cash", isin: "", name: "", amount: 100 });
    expect(repo.remove(created.id)).toBe(true);
    expect(repo.remove(created.id)).toBe(false);
    expect(repo.list()).toHaveLength(0);
  });
});

describe("migrations", () => {
  it("adds bank and interest_rate to a pre-existing positions table", () => {
    const file = path.join(os.tmpdir(), `etf-viewer-migrate-${Date.now()}.sqlite`);
    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE positions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        isin TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy.close();

    const db = createDb(file);
    try {
      const columns = (db.prepare("PRAGMA table_info(positions)").all() as Array<{ name: string }>)
        .map((column) => column.name);
      expect(columns).toContain("bank");
      expect(columns).toContain("interest_rate");
    } finally {
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        fs.rmSync(`${file}${suffix}`, { force: true });
      }
    }
  });
});

describe("fund cache repo", () => {
  it("stores payloads and reports expiry against the clock", () => {
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const db = createDb(":memory:");
    const cache = createFundCacheRepo(db, () => now);

    cache.set(
      "IE00B4L5Y983",
      {
        isin: "IE00B4L5Y983",
        name: "World",
        source: "test",
        stale: false,
        topHoldings: [],
        coverage: 0,
      },
      1000,
    );

    expect(cache.get("IE00B4L5Y983")?.expired).toBe(false);
    now += 1001;
    expect(cache.get("IE00B4L5Y983")?.expired).toBe(true);
  });
});
