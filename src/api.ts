import { HttpStatus } from "../shared/constants.ts";
import type { FundInfo, Portfolio, Position, PositionInput } from "../shared/types.ts";

/** A PATCH body: `interestRate: null` explicitly clears the rate. */
export type PositionPatch = Omit<Partial<PositionInput>, "interestRate"> & {
  interestRate?: number | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new Error(message);
  }

  if (response.status === HttpStatus.NO_CONTENT) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  listPortfolios: () => request<Portfolio[]>("/api/portfolios"),
  createPortfolio: (name: string) =>
    request<Portfolio>("/api/portfolios", { method: "POST", body: JSON.stringify({ name }) }),
  renamePortfolio: (id: string, name: string) =>
    request<Portfolio>(`/api/portfolios/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  listPositions: (portfolioId?: string) =>
    request<Position[]>(
      portfolioId
        ? `/api/positions?portfolioId=${encodeURIComponent(portfolioId)}`
        : "/api/positions",
    ),
  addPosition: (input: PositionInput, portfolioId: string) =>
    request<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ ...input, portfolioId }),
    }),
  updatePosition: (id: string, patch: PositionPatch) =>
    request<Position>(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removePosition: (id: string) => request<void>(`/api/positions/${id}`, { method: "DELETE" }),
  getFund: (isin: string) => request<FundInfo>(`/api/funds/${encodeURIComponent(isin)}`),
};
