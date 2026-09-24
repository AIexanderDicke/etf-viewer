import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

export type FundDataProvider = "fundfacts" | "fundsniffer";

export const FUND_DATA_PROVIDERS = ["fundfacts", "fundsniffer"] as const;

export interface Config {
  readonly port: number;
  /** File-backed SQLite database. */
  readonly dbFile: string;
  /** FundFacts API (ISIN -> whole factsheet). Falls back to the keyless demo endpoint. */
  readonly fundFactsBaseUrl: string;
  readonly fundFactsApiKey: string;
  /** FundSniffer HTTP backend (ISIN -> FundInfo); defaults to the local port 8484 service. */
  readonly fundSnifferBaseUrl: string;
  /** Which provider to try first; the other stays in the chain as a fallback. */
  readonly fundDataProvider: FundDataProvider;
  /** Cached fund payloads are considered fresh for this long. */
  readonly fundCacheTtlMs: number;
  /** Upstream request timeout. */
  readonly upstreamTimeoutMs: number;
  /** Opt-in bundled fund snapshot. Testing/demo only; never on in production. */
  readonly enableSnapshotFallback: boolean;
}

function readInteger(
  env: Env,
  name: string,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}="${raw}": expected an integer between ${min} and ${max}`);
  }
  return value;
}

function readPositiveNumber(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}="${raw}": expected a positive number`);
  }
  return value;
}

function readBoolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1" || raw.toLowerCase() === "true") return true;
  if (raw === "0" || raw.toLowerCase() === "false") return false;
  throw new Error(`Invalid ${name}="${raw}": expected a boolean (1/0, true/false)`);
}

function readUrl(env: Env, name: string, fallback: string): string {
  const raw = env[name] ?? fallback;
  try {
    new URL(raw);
  } catch {
    throw new Error(`Invalid ${name}="${raw}": expected an absolute URL`);
  }
  return raw;
}

function readEnum<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`Invalid ${name}="${raw}": expected one of ${allowed.join(", ")}`);
}

/** Parses and validates the backend configuration, failing fast on bad input. */
export function loadConfig(env: Env = process.env): Config {
  return {
    port: readInteger(env, "PORT", 3000, { min: 0, max: 65_535 }),
    dbFile: env.DB_FILE ?? path.join(process.cwd(), "data", "etf-viewer.sqlite"),
    fundFactsBaseUrl: readUrl(env, "FUNDFACTS_BASE_URL", "https://fundfactsapi.com/api/v1"),
    fundFactsApiKey: env.FUNDFACTS_API_KEY ?? "",
    fundSnifferBaseUrl: readUrl(env, "FUNDSNIFFER_BASE_URL", "http://localhost:8484"),
    fundDataProvider: readEnum(env, "FUND_DATA_PROVIDER", FUND_DATA_PROVIDERS, "fundsniffer"),
    fundCacheTtlMs: readPositiveNumber(env, "FUND_CACHE_TTL_MS", DAY_MS),
    upstreamTimeoutMs: readPositiveNumber(env, "UPSTREAM_TIMEOUT_MS", 30_000),
    enableSnapshotFallback: readBoolean(env, "ENABLE_SNAPSHOT_FALLBACK", false),
  };
}

export const config: Config = loadConfig();
