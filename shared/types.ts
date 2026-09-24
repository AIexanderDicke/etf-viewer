export type AssetKind = "etf" | "cash";

/** A named (or still unnamed) portfolio container. Positions belong to one. */
export interface Portfolio {
  id: string;
  /** User-assigned name; empty while unnamed. */
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  /** The portfolio this position belongs to. */
  portfolioId: string;
  kind: AssetKind;
  /** ISIN for ETFs, empty for cash. */
  isin: string;
  /** Optional human readable label (e.g. "MSCI World"). */
  name: string;
  /** Cash only: bank/institution the cash sits at. */
  bank: string;
  /** Cash only: annual interest rate in percent (e.g. 2.5 for 2.5% p.a.). */
  interestRate?: number;
  /** ETFs only: data source the fund metadata was resolved from (e.g. "FundFacts"). */
  source: string;
  /** Position value in EUR. */
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PositionInput {
  kind: AssetKind;
  isin?: string;
  name?: string;
  bank?: string;
  interestRate?: number;
  source?: string;
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

export interface BreakdownEntry {
  label: string;
  /** Weight inside the fund, in percent (0..100). */
  weight: number;
}

/** Fund-level look-through categories. Arrays may be empty or partial. */
export interface Breakdowns {
  sector: BreakdownEntry[];
  geography: BreakdownEntry[];
}

export type BreakdownKind = keyof Breakdowns;

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
  /** Sector / country exposure, when published. */
  breakdowns?: Breakdowns;
}

/** One aggregated line in the look-through view. */
export interface ExposureRow {
  key: string;
  label: string;
  isin?: string;
  ticker?: string;
  /** EUR value. */
  amount: number;
  /** Fraction of the whole portfolio, 0..1. */
  share: number;
  /** How many funds this position appears in. */
  fundCount: number;
}

export interface TopicRow {
  label: string;
  amount: number;
  share: number;
}

export interface TopicExposure {
  rows: TopicRow[];
  /** Total ETF value the breakdown was computed from. */
  basis: number;
}

export interface LookThrough {
  total: number;
  stocks: ExposureRow[];
  cash: { amount: number; share: number };
  /** ETF value covered by neither top holdings nor a resolved fund. */
  unresolved: { amount: number; share: number; isins: string[] };
  /** ETF value inside resolved funds but outside their published top holdings. */
  unclassified: { amount: number; share: number };
  topics: Record<BreakdownKind, TopicExposure>;
  /** Fraction of the resolved ETF value explained by top holdings, 0..1. */
  coverage: number;
}
