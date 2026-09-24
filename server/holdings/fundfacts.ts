import type { Breakdowns, FundInfo } from "../../shared/types.ts";
import { config } from "../config.ts";
import { toBreakdown, toHoldings } from "./normalize.ts";
import type { HoldingsProvider } from "./types.ts";

const SOURCE = "FundFacts";

interface FundFactsPayload {
  isin?: string;
  name?: string;
  data?: {
    keyFacts?: {
      currency?: string;
      assetClass?: string;
      distribution?: string;
      holdings?: number;
    };
    headlineMetrics?: { ter?: string; aum?: string };
    riskRating?: number;
    benchmarkName?: string;
    dataAsOf?: string;
    topHoldings?: Array<{ name?: string; isin?: string; ticker?: string; weight?: number }>;
    sector?: unknown;
    geography?: unknown;
  };
}

/** Exported for tests: maps the FundFacts envelope onto our FundInfo shape. */
export function normalizeFundFacts(isin: string, json: unknown): FundInfo {
  const payload = (json ?? {}) as FundFactsPayload;
  const data = payload.data ?? {};
  const keyFacts = data.keyFacts ?? {};
  const topHoldings = toHoldings(data.topHoldings);
  const coverage = topHoldings.reduce((sum, holding) => sum + holding.weight, 0) / 100;
  const breakdowns: Breakdowns = {
    sector: toBreakdown(data.sector),
    geography: toBreakdown(data.geography),
  };

  return {
    isin: (payload.isin ?? isin).toUpperCase(),
    name: payload.name?.trim() || isin,
    currency: keyFacts.currency || undefined,
    ter: data.headlineMetrics?.ter || undefined,
    assetClass: keyFacts.assetClass || undefined,
    distribution: keyFacts.distribution || undefined,
    holdingsCount: typeof keyFacts.holdings === "number" ? keyFacts.holdings : undefined,
    riskRating: typeof data.riskRating === "number" ? data.riskRating : undefined,
    benchmark: data.benchmarkName || undefined,
    source: SOURCE,
    stale: false,
    dataAsOf: data.dataAsOf || undefined,
    topHoldings,
    coverage,
    breakdowns,
  };
}

export interface FundFactsProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export function createFundFactsProvider(
  fetchImpl: typeof fetch = fetch,
  options: FundFactsProviderOptions = {},
): HoldingsProvider {
  const baseUrl = options.baseUrl ?? config.fundFactsBaseUrl;
  const apiKey = options.apiKey ?? config.fundFactsApiKey;
  const timeoutMs = options.timeoutMs ?? config.upstreamTimeoutMs;

  return {
    name: SOURCE,
    async getFund(isin) {
      const path = apiKey ? "funds" : "demo/funds";
      const url = `${baseUrl}/${path}/${encodeURIComponent(isin)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      // FundFacts answers 404 (not a fund) or 400 (invalid ISIN) for unknown
      // identifiers; both mean "no data" to us.
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok) {
        throw new Error(`FundFacts responded ${response.status} for ${isin}`);
      }

      return normalizeFundFacts(isin, await response.json());
    },
  };
}
