import { isValidIsin } from "../shared/isin.ts";
import type { Allocation, PortfolioSummary, Position } from "../shared/types.ts";

export { isValidIsin };

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
