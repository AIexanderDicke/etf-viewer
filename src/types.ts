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
