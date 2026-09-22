import { beforeEach, describe, expect, it } from "vitest";
import type { FundInfo } from "../../../shared/types.ts";
import { createDb, createFundCacheRepo, type FundCacheRepo } from "../../../server/db.ts";
import { FundService } from "../../../server/holdings/service.ts";
import type { HoldingsProvider } from "../../../server/holdings/types.ts";

const ISIN = "IE00B4L5Y983";

function fund(source: string, name = "World"): FundInfo {
  return { isin: ISIN, name, source, stale: false, topHoldings: [], coverage: 0 };
}

function provider(name: string, behavior: () => Promise<FundInfo | null>): HoldingsProvider {
  return { name, getFund: behavior };
}

describe("FundService", () => {
  let cache: FundCacheRepo;
  let now: number;

  beforeEach(() => {
    now = Date.parse("2026-01-01T00:00:00.000Z");
    cache = createFundCacheRepo(createDb(":memory:"), () => now);
  });

  it("serves a fresh cache hit without calling providers", async () => {
    cache.set(ISIN, fund("cached"), 1000);
    let calls = 0;
    const service = new FundService({
      providers: [
        provider("p1", async () => {
          calls += 1;
          return fund("p1");
        }),
      ],
      cache,
      ttlMs: 1000,
    });

    const info = await service.getFund(ISIN);
    expect(info?.source).toBe("cached");
    expect(calls).toBe(0);
  });

  it("queries providers when the cache entry expired", async () => {
    cache.set(ISIN, fund("old"), 1000);
    now += 1001;
    const service = new FundService({
      providers: [provider("p1", async () => fund("fresh"))],
      cache,
      ttlMs: 1000,
    });

    const info = await service.getFund(ISIN);
    expect(info?.source).toBe("fresh");
    expect(cache.get(ISIN)?.info.source).toBe("fresh");
  });

  it("falls through to the next provider on error", async () => {
    const service = new FundService({
      providers: [
        provider("broken", async () => {
          throw new Error("upstream down");
        }),
        provider("snapshot", async () => fund("snapshot")),
      ],
      cache,
    });

    expect((await service.getFund(ISIN))?.source).toBe("snapshot");
  });

  it("returns a stale cached payload when every provider fails", async () => {
    cache.set(ISIN, fund("cached"), 1000);
    now += 1001;
    const service = new FundService({
      providers: [provider("broken", async () => null)],
      cache,
    });

    const info = await service.getFund(ISIN);
    expect(info?.source).toBe("cached");
    expect(info?.stale).toBe(true);
  });

  it("returns null when nothing has data and nothing is cached", async () => {
    const service = new FundService({
      providers: [provider("empty", async () => null)],
      cache,
    });

    expect(await service.getFund(ISIN)).toBeNull();
  });
});
