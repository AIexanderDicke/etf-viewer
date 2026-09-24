import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("loadConfig", () => {
  it("applies defaults for an empty environment", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.dbFile).toBe(path.join(process.cwd(), "data", "etf-viewer.sqlite"));
    expect(config.fundFactsBaseUrl).toBe("https://fundfactsapi.com/api/v1");
    expect(config.fundFactsApiKey).toBe("");
    expect(config.fundSnifferBaseUrl).toBe("http://localhost:8484");
    expect(config.fundDataProvider).toBe("fundsniffer");
    expect(config.fundCacheTtlMs).toBe(DAY_MS);
    expect(config.upstreamTimeoutMs).toBe(30_000);
    expect(config.enableSnapshotFallback).toBe(false);
  });

  it("reads overrides", () => {
    const config = loadConfig({
      PORT: "8080",
      DB_FILE: "/tmp/custom.sqlite",
      FUNDFACTS_BASE_URL: "https://example.test/api",
      FUNDFACTS_API_KEY: "secret",
      FUNDSNIFFER_BASE_URL: "http://localhost:9999",
      FUND_DATA_PROVIDER: "fundfacts",
      FUND_CACHE_TTL_MS: "1000",
      UPSTREAM_TIMEOUT_MS: "500",
      ENABLE_SNAPSHOT_FALLBACK: "true",
    });
    expect(config.port).toBe(8080);
    expect(config.dbFile).toBe("/tmp/custom.sqlite");
    expect(config.fundFactsBaseUrl).toBe("https://example.test/api");
    expect(config.fundFactsApiKey).toBe("secret");
    expect(config.fundSnifferBaseUrl).toBe("http://localhost:9999");
    expect(config.fundDataProvider).toBe("fundfacts");
    expect(config.fundCacheTtlMs).toBe(1000);
    expect(config.upstreamTimeoutMs).toBe(500);
    expect(config.enableSnapshotFallback).toBe(true);
  });

  it.each(["1", "true", "TRUE"])("accepts %s as a truthy flag", (raw) => {
    expect(loadConfig({ ENABLE_SNAPSHOT_FALLBACK: raw }).enableSnapshotFallback).toBe(true);
  });

  it.each(["0", "false", "FALSE"])("accepts %s as a falsy flag", (raw) => {
    expect(loadConfig({ ENABLE_SNAPSHOT_FALLBACK: raw }).enableSnapshotFallback).toBe(false);
  });

  it.each([
    ["PORT", "abc"],
    ["PORT", "70000"],
    ["PORT", "-1"],
    ["FUND_CACHE_TTL_MS", "0"],
    ["FUND_CACHE_TTL_MS", "-5"],
    ["UPSTREAM_TIMEOUT_MS", "nope"],
    ["FUNDFACTS_BASE_URL", "not-a-url"],
    ["FUNDSNIFFER_BASE_URL", "not-a-url"],
    ["FUND_DATA_PROVIDER", "bloomberg"],
    ["ENABLE_SNAPSHOT_FALLBACK", "maybe"],
  ])("rejects invalid %s=%s", (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(/Invalid/);
  });

  it("treats empty values as unset", () => {
    const config = loadConfig({ PORT: "", FUND_CACHE_TTL_MS: "" });
    expect(config.port).toBe(3000);
    expect(config.fundCacheTtlMs).toBe(DAY_MS);
  });
});
