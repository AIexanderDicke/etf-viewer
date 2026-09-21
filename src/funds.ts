import type { FundInfo } from "../shared/types.ts";
import { api } from "./api.ts";

export type FundStatus = "idle" | "loading" | "ready" | "error";

export interface FundState {
  status: FundStatus;
  info?: FundInfo;
  error?: string;
}

const states = new Map<string, FundState>();
const inflight = new Map<string, Promise<FundInfo>>();
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

/**
 * Fetches a fund and resolves with its info, caching the result. Concurrent
 * calls for the same ISIN share a single request; use this when the caller
 * needs to know whether the ISIN actually resolves.
 */
export function loadFund(isin: string): Promise<FundInfo> {
  const current = states.get(isin);
  if (current?.status === "ready" && current.info) return Promise.resolve(current.info);

  const existing = inflight.get(isin);
  if (existing) return existing;

  set(isin, { status: "loading" });
  const promise = api.getFund(isin).then(
    (info) => {
      inflight.delete(isin);
      set(isin, { status: "ready", info });
      return info;
    },
    (error: unknown) => {
      inflight.delete(isin);
      set(isin, {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    },
  );
  inflight.set(isin, promise);
  return promise;
}

/** Starts a lookup exactly once per ISIN; repeat calls are no-ops. */
export function ensureFund(isin: string): void {
  const current = states.get(isin);
  if (current && current.status !== "idle") return;
  void loadFund(isin).catch(() => undefined);
}
