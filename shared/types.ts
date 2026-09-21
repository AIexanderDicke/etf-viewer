export type AssetKind = "etf" | "cash";

export interface Position {
  id: string;
  kind: AssetKind;
  /** ISIN for ETFs, empty for cash. */
  isin: string;
  /** Optional human readable label (e.g. "MSCI World"). */
  name: string;
  /** Position value in EUR. */
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PositionInput {
  kind: AssetKind;
  isin?: string;
  name?: string;
  amount: number;
}

export interface Allocation {
  position: Position;
  amount: number;
  /** Fraction of the total portfolio, 0..1. */
  share: number;
}

export interface PortfolioSummary {
  total: number;
  allocations: Allocation[];
}

/** A single constituent of a fund. */
export interface Holding {
  name: string;
  isin?: string;
  ticker?: string;
  /** Weight inside the fund, in percent (0..100). */
  weight: number;
}

export interface FundInfo {
  isin: string;
  name: string;
  currency?: string;
  /** Total expense ratio, as published (e.g. "0.20%"). */
  ter?: string;
  assetClass?: string;
  distribution?: string;
  /** Number of constituents in the fund. */
  holdingsCount?: number;
  riskRating?: number;
  benchmark?: string;
  /** Where the payload came from, e.g. "FundFacts" or "Bundled snapshot". */
  source: string;
  /** True when this is a cached payload that could not be refreshed. */
  stale: boolean;
  /** Publication date of the underlying figures (ISO date). */
  dataAsOf?: string;
  topHoldings: Holding[];
  /** Share of the fund explained by topHoldings, 0..1. */
  coverage: number;
}
