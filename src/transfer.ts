import { isValidIsin, normalizeIsin } from "../shared/isin.ts";
import type { Position, PositionInput } from "../shared/types.ts";

export const PORTFOLIO_EXPORT_FORMAT = "etf-viewer.portfolio";
export const PORTFOLIO_EXPORT_VERSION = 1;

export interface ExportedPosition {
  kind: "etf" | "cash";
  amount: number;
  isin?: string;
  name?: string;
  bank?: string;
  interestRate?: number;
}

export interface PortfolioExport {
  format: typeof PORTFOLIO_EXPORT_FORMAT;
  version: typeof PORTFOLIO_EXPORT_VERSION;
  portfolio: string;
  exportedAt: string;
  positions: ExportedPosition[];
}

/** A portable snapshot of a portfolio's positions. */
export function buildPortfolioExport(
  portfolio: string,
  positions: Position[],
  exportedAt: Date = new Date(),
): PortfolioExport {
  return {
    format: PORTFOLIO_EXPORT_FORMAT,
    version: PORTFOLIO_EXPORT_VERSION,
    portfolio,
    exportedAt: exportedAt.toISOString(),
    positions: positions.map((position) =>
      position.kind === "cash"
        ? {
            kind: "cash",
            amount: position.amount,
            bank: position.bank || undefined,
            interestRate: position.interestRate,
          }
        : {
            kind: "etf",
            amount: position.amount,
            isin: position.isin,
            name: position.name || undefined,
          },
    ),
  };
}

export function portfolioExportFilename(portfolio: string): string {
  const slug = portfolio
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "portfolio"}-positions.json`;
}

/**
 * Reads a portfolio export back into position inputs. Accepts the export
 * envelope or a bare array, and rejects anything the backend would refuse so
 * the user sees a clear message instead of a partial import.
 */
export function parsePortfolioImport(text: string): PositionInput[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  const entries = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.positions)
      ? data.positions
      : undefined;
  if (!entries) throw new Error("Expected a portfolio JSON export.");
  if (entries.length === 0) throw new Error("The file has no positions to import.");

  return entries.map((entry, index) => parsePosition(entry, index));
}

function parsePosition(value: unknown, index: number): PositionInput {
  const label = `Position ${index + 1}`;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  const kind = value.kind;
  if (kind !== "etf" && kind !== "cash") throw new Error(`${label} has an invalid kind.`);

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} needs an amount greater than 0.`);
  }

  if (kind === "etf") {
    const isin = normalizeIsin(typeof value.isin === "string" ? value.isin : "");
    if (!isValidIsin(isin)) throw new Error(`${label} has an invalid ISIN.`);
    const name = typeof value.name === "string" ? value.name.trim() : "";
    return { kind, isin, name, amount };
  }

  const bank = typeof value.bank === "string" ? value.bank.trim() : "";
  const rawRate = value.interestRate;
  let interestRate: number | undefined;
  if (rawRate !== undefined && rawRate !== null && rawRate !== "") {
    const parsed = Number(rawRate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${label} has an invalid interest rate.`);
    }
    interestRate = parsed;
  }
  return { kind, isin: "", name: "", bank, interestRate, amount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
