import type { FundInfo } from "../../shared/types.ts";

/**
 * Resolves an ISIN to fund metadata and holdings.
 * The rest of the app never talks to an upstream provider directly, so a new
 * source can be added without touching routes or the frontend.
 */
export interface HoldingsProvider {
  readonly name: string;
  /** Returns null when this provider has no data for the ISIN. */
  getFund(isin: string): Promise<FundInfo | null>;
}
