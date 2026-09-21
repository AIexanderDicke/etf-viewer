import type { FundInfo } from "../../shared/types.ts";
import type { FundCacheRepo } from "../db.ts";
import { config } from "../config.ts";
import type { HoldingsProvider } from "./types.ts";

export interface FundServiceOptions {
  providers: HoldingsProvider[];
  cache: FundCacheRepo;
  ttlMs?: number;
  onError?: (provider: string, isin: string, error: unknown) => void;
}

/**
 * Resolves a fund by ISIN, using a fresh cache entry when possible and falling
 * back to the next provider otherwise. A stale cache entry is preferred over a
 * hard failure so the UI can still render something (flagged as stale).
 */
export class FundService {
  private readonly providers: HoldingsProvider[];
  private readonly cache: FundCacheRepo;
  private readonly ttlMs: number;
  private readonly onError?: FundServiceOptions["onError"];

  constructor(options: FundServiceOptions) {
    this.providers = options.providers;
    this.cache = options.cache;
    this.ttlMs = options.ttlMs ?? config.fundCacheTtlMs;
    this.onError = options.onError;
  }

  async getFund(isin: string): Promise<FundInfo | null> {
    const normalized = isin.trim().toUpperCase();
    const cached = this.cache.get(normalized);
    if (cached && !cached.expired) return { ...cached.info, stale: false };

    for (const provider of this.providers) {
      try {
        const info = await provider.getFund(normalized);
        if (info) {
          this.cache.set(normalized, info, this.ttlMs);
          return info;
        }
      } catch (error) {
        this.onError?.(provider.name, normalized, error);
      }
    }

    return cached ? { ...cached.info, stale: true } : null;
  }
}
