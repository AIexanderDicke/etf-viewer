import type { FundInfo, Holding } from "../../shared/types.ts";
import type { HoldingsProvider } from "./types.ts";

/**
 * Bundled fixture provider for tests and local demos, gated behind
 * ENABLE_SNAPSHOT_FALLBACK. Never wired into the production provider chain.
 *
 * NOTE: keep this list small and clearly labelled. The live provider is the
 * source of truth; these entries are illustrative and may be out of date.
 */
const SOURCE = "Bundled snapshot";

function info(
  isin: string,
  name: string,
  meta: Omit<FundInfo, "isin" | "name" | "source" | "stale" | "topHoldings" | "coverage">,
  topHoldings: Holding[],
): FundInfo {
  const coverage = topHoldings.reduce((sum, holding) => sum + holding.weight, 0) / 100;
  return { isin, name, source: SOURCE, stale: false, topHoldings, coverage, ...meta };
}

const SNAPSHOT: Record<string, FundInfo> = {
  IE00B4L5Y983: info(
    "IE00B4L5Y983",
    "iShares Core MSCI World UCITS ETF",
    {
      currency: "USD",
      ter: "0.20%",
      assetClass: "Equities",
      distribution: "Accumulating",
      holdingsCount: 1252,
      riskRating: 6,
      benchmark: "MSCI World Index (Net)",
      dataAsOf: "2026-09-17",
    },
    [
      { name: "NVIDIA", weight: 5.54 },
      { name: "APPLE", weight: 5.44 },
      { name: "MICROSOFT", weight: 3.86 },
      { name: "AMAZON.COM INC", weight: 2.71 },
      { name: "ALPHABET CLASS A", weight: 2.16 },
      { name: "BROADCOM INC", weight: 1.83 },
      { name: "ALPHABET CLASS C", weight: 1.7 },
      { name: "META PLATFORMS CLASS A", weight: 1.39 },
      { name: "MICRON TECHNOLOGY", weight: 1.16 },
      { name: "TESLA INC", weight: 1.12 },
    ],
  ),
  IE00B5BMR087: info(
    "IE00B5BMR087",
    "iShares Core S&P 500 UCITS ETF",
    {
      currency: "USD",
      ter: "0.07%",
      assetClass: "Equities",
      distribution: "Accumulating",
      holdingsCount: 505,
      riskRating: 5,
      benchmark: "S&P 500 Index",
      dataAsOf: "2026-09-17",
    },
    [
      { name: "NVIDIA", weight: 7.1 },
      { name: "MICROSOFT", weight: 6.3 },
      { name: "APPLE", weight: 5.9 },
      { name: "AMAZON.COM INC", weight: 3.8 },
      { name: "ALPHABET CLASS A", weight: 3.0 },
      { name: "META PLATFORMS CLASS A", weight: 2.5 },
      { name: "ALPHABET CLASS C", weight: 2.4 },
      { name: "BROADCOM INC", weight: 2.3 },
      { name: "TESLA INC", weight: 1.9 },
      { name: "BERKSHIRE HATHAWAY CLASS B", weight: 1.6 },
    ],
  ),
  IE00BKM4GZ66: info(
    "IE00BKM4GZ66",
    "iShares Core MSCI EM IMI UCITS ETF",
    {
      currency: "USD",
      ter: "0.18%",
      assetClass: "Equities",
      distribution: "Accumulating",
      holdingsCount: 3321,
      riskRating: 6,
      benchmark: "MSCI EM IMI Index",
      dataAsOf: "2026-09-17",
    },
    [
      { name: "TAIWAN SEMICONDUCTOR MANUFACTURING", weight: 9.2 },
      { name: "TENCENT HOLDINGS", weight: 4.1 },
      { name: "SAMSUNG ELECTRONICS", weight: 3.4 },
      { name: "ALIBABA GROUP HOLDING", weight: 2.6 },
      { name: "SK HYNIX", weight: 2.0 },
      { name: "HDFC BANK", weight: 1.1 },
      { name: "RELIANCE INDUSTRIES", weight: 1.0 },
      { name: "CHINA CONSTRUCTION BANK", weight: 0.9 },
      { name: "HON HAI PRECISION INDUSTRY", weight: 0.8 },
      { name: "MEITUAN", weight: 0.7 },
    ],
  ),
};

export function createSnapshotProvider(): HoldingsProvider {
  return {
    name: SOURCE,
    async getFund(isin) {
      const found = SNAPSHOT[isin.toUpperCase()];
      return found ? structuredClone(found) : null;
    },
  };
}

export function snapshotIsins(): string[] {
  return Object.keys(SNAPSHOT);
}
