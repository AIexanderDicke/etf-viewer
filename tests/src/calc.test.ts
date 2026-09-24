import { describe, expect, it } from "vitest";
import type { Position } from "../../shared/types.ts";
import { isValidIsin, summarize } from "../../src/calc.ts";

function position(partial: Partial<Position> & Pick<Position, "kind" | "amount">): Position {
  return {
    id: partial.id ?? Math.random().toString(36),
    portfolioId: partial.portfolioId ?? "portfolio-1",
    kind: partial.kind,
    isin: partial.isin ?? "",
    name: partial.name ?? "",
    bank: partial.bank ?? "",
    source: partial.source ?? "",
    amount: partial.amount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("isValidIsin", () => {
  it("accepts well-formed ISINs", () => {
    expect(isValidIsin("IE00B4L5Y983")).toBe(true);
    expect(isValidIsin("ie00b4l5y983")).toBe(true);
  });

  it("rejects malformed ISINs", () => {
    expect(isValidIsin("BAD")).toBe(false);
    expect(isValidIsin("IE00B4L5Y98")).toBe(false);
  });
});

describe("summarize", () => {
  it("computes shares including cash", () => {
    const summary = summarize([
      position({ kind: "etf", isin: "IE00B4L5Y983", amount: 6000 }),
      position({ kind: "etf", isin: "IE00BKM4GZ66", amount: 2000 }),
      position({ kind: "cash", amount: 2000 }),
    ]);

    expect(summary.total).toBe(10000);
    expect(summary.allocations.map((a) => Math.round(a.share * 100))).toEqual([60, 20, 20]);
  });

  it("ignores invalid positions", () => {
    const summary = summarize([
      position({ kind: "etf", isin: "IE00B4L5Y983", amount: 1000 }),
      position({ kind: "etf", isin: "BAD", amount: 5000 }),
      position({ kind: "cash", amount: 0 }),
    ]);

    expect(summary.total).toBe(1000);
    expect(summary.allocations).toHaveLength(1);
  });

  it("ignores non-finite and negative amounts", () => {
    const summary = summarize([
      position({ kind: "cash", amount: Number.NaN }),
      position({ kind: "cash", amount: -50 }),
      position({ kind: "cash", amount: 200 }),
    ]);

    expect(summary.total).toBe(200);
    expect(summary.allocations).toHaveLength(1);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    expect(summarize([]).total).toBe(0);
    expect(summarize([]).allocations).toHaveLength(0);
  });
});
