import type { FundInfo } from "../shared/types.ts";
import { api } from "./api.ts";

export type FundStatus = "idle" | "loading" | "ready" | "error";

export interface FundState {
  status: FundStatus;
  info?: FundInfo;
  error?: string;
}

const states = new Map<string, FundState>();
const listeners = new Set<() => void>();

function set(isin: string, next: FundState): void {
  states.set(isin, next);
  for (const listener of listeners) listener();
}

export function subscribeFunds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFundState(isin: string): FundState {
  return states.get(isin) ?? { status: "idle" };
}

/** Starts a lookup exactly once per ISIN; repeat calls are no-ops. */
export function ensureFund(isin: string): void {
  const current = states.get(isin);
  if (current && current.status !== "idle") return;

  set(isin, { status: "loading" });
  api.getFund(isin).then(
    (info) => set(isin, { status: "ready", info }),
    (error: unknown) =>
      set(isin, { status: "error", error: error instanceof Error ? error.message : "Unknown error" }),
  );
}
