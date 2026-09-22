import { describe, expect, it } from "vitest";
import { computeLookThrough, hasTopicData, normalizeName, stockKey } from "../../shared/exposure.ts";
import type { FundInfo, Position } from "../../shared/types.ts";

function position(partial: Partial<Position> & Pick<Position, "kind" | "amount">): Position {
  return {
    id: partial.id ?? Math.random().toString(36),
    portfolioId: partial.portfolioId ?? "portfolio-1",
    kind: partial.kind,
    isin: partial.isin ?? "",
    name: partial.name ?? "",
    bank: partial.bank ?? "",
    amount: partial.amount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function fund(
  isin: string,
  top: Array<[string, number]>,
  sector: Array<[string, number]> = [],
): FundInfo {
  return {
    isin,
    name: isin,
    source: "test",
    stale: false,
    topHoldings: top.map(([name, weight]) => ({ name, weight })),
    coverage: top.reduce((sum, [, w]) => sum + w, 0) / 100,
    breakdowns: {
      sector: sector.map(([label, weight]) => ({ label, weight })),
      geography: [],
    },
  };
}

const positions = [
  position({ kind: "etf", isin: "IE00B4L5Y983", amount: 6000 }),
  position({ kind: "etf", isin: "IE00B5BMR087", amount: 4000 }),
  position({ kind: "cash", amount: 2000 }),
];

const funds = new Map<string, FundInfo>([
  [
    "IE00B4L5Y983",
    fund(
      "IE00B4L5Y983",
      [
        ["NVIDIA", 5.54],
        ["APPLE", 5.44],
        ["ALPHABET CLASS A", 2.16],
      ],
      [
        ["Information Technology", 30],
        ["Financials", 20],
      ],
    ),
  ],
  [
    "IE00B5BMR087",
    fund(
      "IE00B5BMR087",
      [
        ["NVIDIA", 7.1],
        ["APPLE INC", 5.9],
      ],
      [["Information Technology", 25]],
    ),
  ],
]);

describe("stockKey / normalizeName", () => {
  it("merges different spellings of the same company", () => {
    expect(normalizeName("APPLE INC")).toBe("APPLE");
    expect(stockKey({ name: "APPLE" })).toBe(stockKey({ name: "APPLE INC" }));
  });

  it("prefers ISIN or ticker when present", () => {
    expect(stockKey({ name: "Whatever", isin: "US0378331005" })).toBe("isin:US0378331005");
    expect(stockKey({ name: "Whatever", ticker: "aapl" })).toBe("ticker:AAPL");
  });
});

describe("computeLookThrough", () => {
  const result = computeLookThrough(positions, funds);

  it("aggregates the same stock across funds", () => {
    const nvidia = result.stocks.find((s) => s.label === "NVIDIA");
    expect(nvidia?.amount).toBeCloseTo(332.4 + 284, 5);
    expect(nvidia?.fundCount).toBe(2);

    const apple = result.stocks.find((s) => s.key === stockKey({ name: "APPLE" }));
    expect(apple?.amount).toBeCloseTo(326.4 + 236, 5);
    expect(apple?.fundCount).toBe(2);
  });

  it("sorts stocks by value descending", () => {
    const values = result.stocks.map((s) => s.amount);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("computes coverage and the unclassified remainder", () => {
    expect(result.coverage).toBeCloseTo((6000 * 0.1314 + 4000 * 0.13) / 10000, 5);
    expect(result.unclassified.amount).toBeCloseTo(6000 * 0.8686 + 4000 * 0.87, 5);
  });

  it("reconciles to the portfolio total", () => {
    const stockSum = result.stocks.reduce((sum, s) => sum + s.amount, 0);
    const total =
      stockSum + result.cash.amount + result.unclassified.amount + result.unresolved.amount;
    expect(total).toBeCloseTo(result.total, 5);
    expect(result.total).toBe(12000);
  });

  it("aggregates a topic and adds the not-disclosed remainder", () => {
    const sector = result.topics.sector;
    expect(sector.basis).toBe(10000);

    const it = sector.rows.find((r) => r.label === "Information Technology");
    expect(it?.amount).toBeCloseTo(1800 + 1000, 5);

    const other = sector.rows.find((r) => r.label === "Other / not disclosed");
    expect(other?.amount).toBeCloseTo(3000 + 3000, 5);

    const topicSum = sector.rows.reduce((sum, r) => sum + r.amount, 0);
    expect(topicSum).toBeCloseTo(10000, 5);
  });

  it("flags ETFs without fund data as unresolved", () => {
    const withUnresolved = computeLookThrough(
      [...positions, position({ kind: "etf", isin: "IE00BKM4GZ66", amount: 1000 })],
      funds,
    );
    expect(withUnresolved.unresolved.amount).toBe(1000);
    expect(withUnresolved.unresolved.isins).toEqual(["IE00BKM4GZ66"]);
  });

  it("ignores unusable positions", () => {
    const dirty = computeLookThrough(
      [
        position({ kind: "etf", isin: "BAD", amount: 5000 }),
        position({ kind: "cash", amount: 100 }),
      ],
      funds,
    );
    expect(dirty.total).toBe(100);
    expect(dirty.unresolved.amount).toBe(0);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const empty = computeLookThrough([], funds);
    expect(empty.total).toBe(0);
    expect(empty.cash.share).toBe(0);
    expect(empty.unresolved.share).toBe(0);
    expect(empty.unclassified.share).toBe(0);
    expect(empty.topics.sector.rows).toEqual([]);
    expect(empty.coverage).toBe(0);
  });

  it("reports no topic data for a cash-only portfolio", () => {
    const cashOnly = computeLookThrough([position({ kind: "cash", amount: 100 })], funds);
    expect(cashOnly.cash.amount).toBe(100);
    expect(cashOnly.topics.sector.basis).toBe(0);
    expect(hasTopicData(cashOnly.topics.sector)).toBe(false);
    expect(hasTopicData(result.topics.sector)).toBe(true);
  });

  it("keeps the breakdown basis to the funds that publish it", () => {
    const onlySp500 = new Map([["IE00B5BMR087", funds.get("IE00B5BMR087")!]]);
    const partial = computeLookThrough(positions, onlySp500);
    expect(partial.topics.sector.basis).toBe(4000);
    expect(partial.topics.geography.rows).toEqual([]);
  });

  it("falls back to the normalised name when no ISIN or ticker is present", () => {
    const byName = new Map<string, FundInfo>([
      ["IE00B4L5Y983", fund("IE00B4L5Y983", [["Apple Inc", 10]])],
    ]);
    const lookup = computeLookThrough(
      [position({ kind: "etf", isin: "IE00B4L5Y983", amount: 1000 })],
      byName,
    );
    expect(lookup.stocks[0]?.key).toBe("name:APPLE");
  });

  it("deduplicates repeated unresolved ISINs", () => {
    const result = computeLookThrough(
      [
        position({ kind: "etf", isin: "IE00BKM4GZ66", amount: 100 }),
        position({ kind: "etf", isin: "IE00BKM4GZ66", amount: 200 }),
      ],
      new Map(),
    );
    expect(result.unresolved.amount).toBe(300);
    expect(result.unresolved.isins).toEqual(["IE00BKM4GZ66"]);
  });

  it("clamps coverage above 100% and adds no unclassified remainder", () => {
    const over = new Map([
      [
        "IE00B4L5Y983",
        fund("IE00B4L5Y983", [
          ["A", 80],
          ["B", 50],
        ]),
      ],
    ]);
    const result = computeLookThrough(
      [position({ kind: "etf", isin: "IE00B4L5Y983", amount: 1000 })],
      over,
    );
    expect(result.unclassified.amount).toBe(0);
    expect(result.coverage).toBeCloseTo(1, 5);
  });

  it("does not add a not-disclosed bucket when a breakdown exceeds 100%", () => {
    const over = new Map([
      [
        "IE00B4L5Y983",
        fund(
          "IE00B4L5Y983",
          [],
          [
            ["A", 60],
            ["B", 60],
          ],
        ),
      ],
    ]);
    const result = computeLookThrough(
      [position({ kind: "etf", isin: "IE00B4L5Y983", amount: 1000 })],
      over,
    );
    expect(result.topics.sector.rows.some((row) => row.label === "Other / not disclosed")).toBe(
      false,
    );
    expect(result.topics.sector.basis).toBe(1000);
  });
});
