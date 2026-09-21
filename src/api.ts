import type { FundInfo, Position, PositionInput } from "../shared/types.ts";

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

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  listPositions: () => request<Position[]>("/api/positions"),
  addPosition: (input: PositionInput) =>
    request<Position>("/api/positions", { method: "POST", body: JSON.stringify(input) }),
  updatePosition: (id: string, patch: PositionPatch) =>
    request<Position>(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removePosition: (id: string) => request<void>(`/api/positions/${id}`, { method: "DELETE" }),
  getFund: (isin: string) => request<FundInfo>(`/api/funds/${encodeURIComponent(isin)}`),
};
