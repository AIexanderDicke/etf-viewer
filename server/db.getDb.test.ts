import { afterEach, describe, expect, it, vi } from "vitest";

describe("getDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("memoises a single shared connection", async () => {
    vi.stubEnv("DB_FILE", ":memory:");
    const { getDb } = await import("./db.ts");

    const first = getDb();
    expect(getDb()).toBe(first);

    first.close();
  });
});
