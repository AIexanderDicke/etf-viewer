import type { BreakdownEntry, Holding } from "../../shared/types.ts";

interface RawHolding {
  name?: string;
  isin?: string;
  ticker?: string;
  weight?: number;
}

function isHolding(value: unknown): value is RawHolding {
  return (
    typeof value === "object" && value !== null && typeof (value as RawHolding).weight === "number"
  );
}

/** Normalises a provider's holding rows: drops malformed ones and sorts by weight. */
export function toHoldings(rows: unknown): Holding[] {
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

interface LabelWeight {
  label?: string;
  weight?: number;
}

function isLabelWeight(value: unknown): value is LabelWeight {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LabelWeight).label === "string" &&
    typeof (value as LabelWeight).weight === "number"
  );
}

/** Normalises a composition array: drops blank labels and sorts by weight. */
export function toBreakdown(rows: unknown): BreakdownEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isLabelWeight)
    .map((row) => ({ label: row.label!.trim(), weight: Number(row.weight) || 0 }))
    .filter((entry) => entry.label.length > 0)
    .sort((a, b) => b.weight - a.weight);
}
