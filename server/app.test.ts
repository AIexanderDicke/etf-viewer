import type { AddressInfo } from "node:net";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FundInfo, Position } from "../shared/types.ts";
import { createApp } from "./app.ts";
import { createDb, createFundCacheRepo, createPositionRepo, type Db } from "./db.ts";
import { FundService } from "./holdings/service.ts";
import type { HoldingsProvider } from "./holdings/types.ts";

const ETF_ISIN = "IE00B4L5Y983";

const fund: FundInfo = {
  isin: ETF_ISIN,
  name: "iShares Core MSCI World UCITS ETF",
  source: "test",
  stale: false,
  topHoldings: [{ name: "NVIDIA", weight: 5.54 }],
  coverage: 0.0554,
};

const provider: HoldingsProvider = {
  name: "test",
  async getFund(isin) {
    return isin === ETF_ISIN ? fund : null;
  },
};

describe("HTTP API", () => {
  let db: Db;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = createDb(":memory:");
    const app = createApp({
      positionRepo: createPositionRepo(db),
      fundService: new FundService({ providers: [provider], cache: createFundCacheRepo(db) }),
      fundDataMode: "demo",
    });
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  async function json<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const body = response.status === 204 ? undefined : await response.json();
    return { status: response.status, body: body as T };
  }

  it("reports health and the fund-data mode", async () => {
    const { status, body } = await json<{ status: string; fundDataMode: string }>("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", fundDataMode: "demo" });
  });

  it("creates, lists, updates and deletes a position", async () => {
    const created = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "etf", isin: ETF_ISIN, amount: 1000 }),
    });
    expect(created.status).toBe(201);
    expect(created.body.isin).toBe(ETF_ISIN);

    const listed = await json<Position[]>("/api/positions");
    expect(listed.body).toHaveLength(1);

    const patched = await json<Position>(`/api/positions/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ amount: 2500 }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.amount).toBe(2500);

    const removed = await json<void>(`/api/positions/${created.body.id}`, { method: "DELETE" });
    expect(removed.status).toBe(204);

    const missing = await json<{ error: string }>(`/api/positions/${created.body.id}`, {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });

  it("stores and later clears a cash interest rate", async () => {
    const created = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({
        kind: "cash",
        amount: 5000,
        bank: "Deutsche Bank",
        interestRate: 2.5,
      }),
    });
    expect(created.body.interestRate).toBe(2.5);

    const cleared = await json<Position>(`/api/positions/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ interestRate: null }),
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.interestRate).toBeUndefined();
    expect(cleared.body.bank).toBe("Deutsche Bank");
  });

  it.each([
    ["unknown kind", { kind: "bond", amount: 100 }],
    ["zero amount", { kind: "cash", amount: 0 }],
    ["negative amount", { kind: "cash", amount: -1 }],
    ["non-numeric amount", { kind: "cash", amount: "lots" }],
    ["invalid ISIN", { kind: "etf", isin: "BAD", amount: 100 }],
    ["negative interest rate", { kind: "cash", amount: 100, interestRate: -1 }],
  ])("rejects %s with 400", async (_label, payload) => {
    const { status, body } = await json<{ error: string }>("/api/positions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("rejects malformed JSON with 400, not 500", async () => {
    const response = await fetch(`${baseUrl}/api/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid request" });
  });

  it("returns 404 when patching a missing position", async () => {
    const { status } = await json<{ error: string }>("/api/positions/does-not-exist", {
      method: "PATCH",
      body: JSON.stringify({ amount: 1 }),
    });
    expect(status).toBe(404);
  });

  it("serves fund data and validates the ISIN", async () => {
    const found = await json<FundInfo>(`/api/funds/${ETF_ISIN}`);
    expect(found.status).toBe(200);
    expect(found.body.name).toContain("MSCI World");

    const unknown = await json<{ error: string }>("/api/funds/US0378331005");
    expect(unknown.status).toBe(404);

    const invalid = await json<{ error: string }>("/api/funds/NOPE");
    expect(invalid.status).toBe(400);
  });

  it("404s unknown routes", async () => {
    const { status, body } = await json<{ error: string }>("/api/nope");
    expect(status).toBe(404);
    expect(body.error).toBe("not found");
  });
});
