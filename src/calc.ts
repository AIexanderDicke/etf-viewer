import type { Allocation, PortfolioSummary, Position } from "./types.ts";

/** Light structural check for an ISIN: 2 letters + 9 alphanumerics + check digit. */
export function isValidIsin(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin.trim().toUpperCase());
}

export function isUsable(position: Position): boolean {
  if (!Number.isFinite(position.amount) || position.amount <= 0) return false;
  if (position.kind === "etf" && !isValidIsin(position.isin)) return false;
  return true;
}

export function summarize(positions: Position[]): PortfolioSummary {
  const usable = positions.filter(isUsable);
  const total = usable.reduce((sum, position) => sum + position.amount, 0);

  const allocations: Allocation[] = usable
    .map((position) => ({
      position,
      amount: position.amount,
      share: total > 0 ? position.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { total, allocations };
}
