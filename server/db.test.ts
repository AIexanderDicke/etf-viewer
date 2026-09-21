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
