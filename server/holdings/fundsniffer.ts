import type { Breakdowns, FundInfo } from "../../shared/types.ts";
import { config } from "../config.ts";
import { toBreakdown, toHoldings } from "./normalize.ts";
import type { HoldingsProvider } from "./types.ts";

const SOURCE = "FundSniffer";

interface FundSnifferPayload {
  isin?: string;
  name?: string;
  currency?: string;
  ter?: string;
  assetClass?: string;
  distribution?: string;
  holdingsCount?: number;
  riskRating?: number;
  benchmark?: string;
  dataAsOf?: string;
  topHoldings?: unknown;
  breakdowns?: {
    sector?: unknown;
    geography?: unknown;
  };
}

/** Exported for tests: maps the FundSniffer envelope onto our FundInfo shape. */
export function normalizeFundSniffer(isin: string, json: unknown): FundInfo {
  const payload = (json ?? {}) as FundSnifferPayload;
  const topHoldings = toHoldings(payload.topHoldings);
  const coverage = topHoldings.reduce((sum, holding) => sum + holding.weight, 0) / 100;
  const breakdowns: Breakdowns = {
    sector: toBreakdown(payload.breakdowns?.sector),
    geography: toBreakdown(payload.breakdowns?.geography),
  };

  return {
    isin: (payload.isin ?? isin).toUpperCase(),
    name: payload.name?.trim() || isin,
    currency: payload.currency || undefined,
    ter: payload.ter || undefined,
    assetClass: payload.assetClass || undefined,
    distribution: payload.distribution || undefined,
    holdingsCount: typeof payload.holdingsCount === "number" ? payload.holdingsCount : undefined,
    riskRating: typeof payload.riskRating === "number" ? payload.riskRating : undefined,
    benchmark: payload.benchmark || undefined,
    source: SOURCE,
    stale: false,
    dataAsOf: payload.dataAsOf || undefined,
    topHoldings,
    coverage,
    breakdowns,
  };
}

export interface FundSnifferProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createFundSnifferProvider(
  fetchImpl: typeof fetch = fetch,
  options: FundSnifferProviderOptions = {},
): HoldingsProvider {
  const baseUrl = options.baseUrl ?? config.fundSnifferBaseUrl;
  const timeoutMs = options.timeoutMs ?? config.upstreamTimeoutMs;

  return {
    name: SOURCE,
    async getFund(isin) {
      const url = `${baseUrl}/fund/${encodeURIComponent(isin)}`;
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      // FundSniffer answers 404 (not a fund) or 400 (invalid ISIN) for unknown
      // identifiers; both mean "no data" to us. Other failures (503 blocked,
      // 504 timeout, 502 network/parse) are transient and throw so the
      // FundService can fall back or serve a stale cache entry.
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) {
        throw new Error(`FundSniffer responded ${response.status} for ${isin}`);
      }

      return normalizeFundSniffer(isin, await response.json());
    },
  };
}
