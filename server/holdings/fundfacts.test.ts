import { describe, expect, it } from "vitest";
import { normalizeFundFacts } from "./fundfacts.ts";

const payload = {
  isin: "IE00B4L5Y983",
  name: "iShares Core MSCI World UCITS ETF",
  data: {
    keyFacts: {
      currency: "USD",
      assetClass: "Equities",
      distribution: "Accumulating",
      holdings: 1252,
    },
    headlineMetrics: { ter: "0.20%" },
    riskRating: 6,
    benchmarkName: "MSCI World Index (Net)",
    dataAsOf: "2026-09-17",
    topHoldings: [
      { name: "APPLE", weight: 5.24 },
      { name: "NVIDIA", weight: 5.54 },
      { name: "", weight: 1.1 },
      { name: "IGNORED", weight: "nope" },
    ],
    sector: [
      { label: "Information Technology", weight: 30.33 },
      { label: "Financials", weight: 16.1 },
      { label: "", weight: 5 },
    ],
    geography: [{ label: "United States", weight: 72.29 }],
  },
};

describe("normalizeFundFacts", () => {
  it("maps the envelope onto FundInfo", () => {
    const info = normalizeFundFacts("IE00B4L5Y983", payload);

    expect(info.name).toBe("iShares Core MSCI World UCITS ETF");
    expect(info.currency).toBe("USD");
    expect(info.ter).toBe("0.20%");
    expect(info.holdingsCount).toBe(1252);
    expect(info.riskRating).toBe(6);
    expect(info.dataAsOf).toBe("2026-09-17");
    expect(info.source).toBe("FundFacts");
    expect(info.stale).toBe(false);
  });

  it("sorts holdings by weight, drops malformed rows and computes coverage", () => {
    const info = normalizeFundFacts("IE00B4L5Y983", payload);

    expect(info.topHoldings.map((h) => h.name)).toEqual(["NVIDIA", "APPLE", "Unknown"]);
    expect(info.coverage).toBeCloseTo((5.54 + 5.24 + 1.1) / 100, 5);
  });

  it("parses breakdowns, drops blank labels", () => {
    const info = normalizeFundFacts("IE00B4L5Y983", payload);

    expect(info.breakdowns?.sector.map((s) => s.label)).toEqual([
      "Information Technology",
      "Financials",
    ]);
    expect(info.breakdowns?.geography[0]).toEqual({ label: "United States", weight: 72.29 });
  });

  it("survives an empty payload", () => {
    const info = normalizeFundFacts("XX0000000000", {});
    expect(info.name).toBe("XX0000000000");
    expect(info.topHoldings).toEqual([]);
    expect(info.coverage).toBe(0);
  });
});
