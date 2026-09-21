import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** File-backed SQLite database. */
  dbFile: process.env.DB_FILE ?? path.join(process.cwd(), "data", "etf-viewer.sqlite"),
  /** FundFacts API (ISIN -> whole factsheet). Falls back to the keyless demo endpoint. */
  fundFactsBaseUrl: process.env.FUNDFACTS_BASE_URL ?? "https://fundfactsapi.com/api/v1",
  fundFactsApiKey: process.env.FUNDFACTS_API_KEY ?? "",
  /** Cached fund payloads are considered fresh for this long. */
  fundCacheTtlMs: Number(process.env.FUND_CACHE_TTL_MS ?? DAY_MS),
  /** Upstream request timeout. */
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 30_000),
};
