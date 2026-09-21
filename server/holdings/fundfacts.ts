import type { FundInfo, Holding } from "../../shared/types.ts";
import { config } from "../config.ts";
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
  };
}

interface FundFactsHolding {
  name?: string;
  isin?: string;
  ticker?: string;
  weight?: number;
}

function isHolding(value: unknown): value is FundFactsHolding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FundFactsHolding).weight === "number"
  );
}

function toHoldings(rows: unknown): Holding[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isHolding)
    .map((row) => ({
      name: row.name?.trim() || "Unknown",
      isin: row.isin?.trim() || undefined,
      ticker: row.ticker?.trim() || undefined,
      weight: Number(row.weight) || 0,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Exported for tests: maps the FundFacts envelope onto our FundInfo shape. */
export function normalizeFundFacts(isin: string, json: unknown): FundInfo {
  const payload = (json ?? {}) as FundFactsPayload;
  const data = payload.data ?? {};
  const keyFacts = data.keyFacts ?? {};
  const topHoldings = toHoldings(data.topHoldings);
  const coverage = topHoldings.reduce((sum, holding) => sum + holding.weight, 0) / 100;

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
  };
}

export function createFundFactsProvider(fetchImpl: typeof fetch = fetch): HoldingsProvider {
  return {
    name: SOURCE,
    async getFund(isin) {
      const path = config.fundFactsApiKey ? "funds" : "demo/funds";
      const url = `${config.fundFactsBaseUrl}/${path}/${encodeURIComponent(isin)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (config.fundFactsApiKey) headers.Authorization = `Bearer ${config.fundFactsApiKey}`;

      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(config.upstreamTimeoutMs),
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`FundFacts responded ${response.status} for ${isin}`);
      }

      return normalizeFundFacts(isin, await response.json());
    },
  };
}
