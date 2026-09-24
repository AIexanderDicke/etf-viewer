import type { AddressInfo } from "node:net";
import { once } from "node:events";
import fs from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FundInfo, Portfolio, Position } from "../../shared/types.ts";
import { createApp } from "../../server/app.ts";
import {
  createDb,
  createFundCacheRepo,
  createPortfolioRepo,
  createPositionRepo,
  type Db,
} from "../../server/db.ts";
import { FundService } from "../../server/holdings/service.ts";
import type { HoldingsProvider } from "../../server/holdings/types.ts";

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
      portfolioRepo: createPortfolioRepo(db),
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

  it("joins a repeated ETF ISIN by summing its amount", async () => {
    const first = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "etf", isin: ETF_ISIN, name: "World", amount: 1000 }),
    });
    expect(first.status).toBe(201);

    const second = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "etf", isin: ETF_ISIN, amount: 500 }),
    });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.amount).toBe(1500);
    expect(second.body.name).toBe("World");

    const listed = await json<Position[]>("/api/positions");
    expect(listed.body).toHaveLength(1);
  });

  it("stores and updates the fund data source on an ETF", async () => {
    const created = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({
        kind: "etf",
        isin: ETF_ISIN,
        name: "World",
        source: "FundSniffer",
        amount: 1000,
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("FundSniffer");

    const patched = await json<Position>(`/api/positions/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ source: "FundFacts" }),
    });
    expect(patched.body.source).toBe("FundFacts");
  });

  it("lists, creates and renames portfolios", async () => {
    const initial = await json<Portfolio[]>("/api/portfolios");
    expect(initial.body).toHaveLength(1);

    const created = await json<Portfolio>("/api/portfolios", {
      method: "POST",
      body: JSON.stringify({ name: "Retirement" }),
    });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Retirement");

    const unnamed = await json<Portfolio>("/api/portfolios", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(unnamed.body.name).toBe("Portfolio 1");

    const renamed = await json<Portfolio>(`/api/portfolios/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Pension" }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Pension");

    const duplicate = await json<{ error: string }>("/api/portfolios", {
      method: "POST",
      body: JSON.stringify({ name: "pension" }),
    });
    expect(duplicate.status).toBe(409);

    const duplicateRename = await json<{ error: string }>(`/api/portfolios/${renamed.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Portfolio 1" }),
    });
    expect(duplicateRename.status).toBe(409);

    const missing = await json<{ error: string }>("/api/portfolios/nope", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    expect(missing.status).toBe(404);

    const bad = await json<{ error: string }>(`/api/portfolios/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    expect(bad.status).toBe(400);
  });

  it("scopes positions to a portfolio and rejects unknown ones", async () => {
    const [defaultPortfolio] = (await json<Portfolio[]>("/api/portfolios")).body;
    const created = await json<Portfolio>("/api/portfolios", {
      method: "POST",
      body: JSON.stringify({ name: "Second" }),
    });

    await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "cash", amount: 100, portfolioId: created.body.id }),
    });

    const scoped = await json<Position[]>(`/api/positions?portfolioId=${created.body.id}`);
    expect(scoped.body).toHaveLength(1);
    expect(scoped.body[0]?.portfolioId).toBe(created.body.id);

    const other = await json<Position[]>(`/api/positions?portfolioId=${defaultPortfolio?.id}`);
    expect(other.body).toHaveLength(0);

    const unknown = await json<{ error: string }>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "cash", amount: 100, portfolioId: "does-not-exist" }),
    });
    expect(unknown.status).toBe(400);
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

  it("rejects an invalid position patch with 400", async () => {
    const created = await json<Position>("/api/positions", {
      method: "POST",
      body: JSON.stringify({ kind: "cash", amount: 100 }),
    });

    const { status, body } = await json<{ error: string }>(`/api/positions/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ amount: 0 }),
    });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
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

describe("static frontend", () => {
  let db: Db;
  let server: Server;
  let baseUrl: string;
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "etf-static-"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>ETF Viewer</title>");
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "app.js"), "console.log('hi');");

    db = createDb(":memory:");
    const app = createApp({
      portfolioRepo: createPortfolioRepo(db),
      positionRepo: createPositionRepo(db),
      fundService: new FundService({ providers: [provider], cache: createFundCacheRepo(db) }),
      fundDataMode: "demo",
      staticDir: dir,
    });
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("serves the built index and hashed assets", async () => {
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("ETF Viewer");

    const asset = await fetch(`${baseUrl}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log('hi');");
  });

  it("falls back to index.html for client routes but keeps the API", async () => {
    const deep = await fetch(`${baseUrl}/positions`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain("ETF Viewer");

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);

    const missing = await fetch(`${baseUrl}/api/nope`);
    expect(missing.status).toBe(404);
  });
});
