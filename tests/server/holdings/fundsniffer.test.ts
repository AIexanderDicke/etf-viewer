import { describe, expect, it, vi } from "vitest";
import {
  createFundSnifferProvider,
  normalizeFundSniffer,
} from "../../../server/holdings/fundsniffer.ts";

const ISIN = "IE00B4L5Y983";

function fetchReturning(body: unknown, status = 200) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(body === null ? null : JSON.stringify(body), { status }),
    ) as unknown as typeof fetch;
}

const payload = {
  isin: "IE00B4L5Y983",
  name: "iShares Core MSCI World UCITS ETF",
  currency: "USD",
  ter: "0.20%",
  assetClass: "Aktien",
  distribution: "Thesaurierend",
  benchmark: "MSCI World",
  dataAsOf: "2026-09-17",
  source: "finanzen.net",
  stale: false,
  topHoldings: [
    { name: "NVIDIA", weight: 5.54, isin: "US67066G1040" },
    { name: "APPLE", weight: 5.24 },
    { name: "", weight: 1.1 },
    { name: "IGNORED", weight: "nope" },
  ],
  breakdowns: {
    sector: [
      { label: "Information Technology", weight: 30.33 },
      { label: "", weight: 5 },
    ],
    geography: [{ label: "United States", weight: 72.29 }],
  },
};

describe("normalizeFundSniffer", () => {
  it("maps the envelope onto FundInfo", () => {
    const info = normalizeFundSniffer("IE00B4L5Y983", payload);

    expect(info.name).toBe("iShares Core MSCI World UCITS ETF");
    expect(info.currency).toBe("USD");
    expect(info.ter).toBe("0.20%");
    expect(info.assetClass).toBe("Aktien");
    expect(info.distribution).toBe("Thesaurierend");
    expect(info.benchmark).toBe("MSCI World");
    expect(info.dataAsOf).toBe("2026-09-17");
    expect(info.source).toBe("FundSniffer");
    expect(info.stale).toBe(false);
  });

  it("keeps the published rating/count when present and leaves them unset otherwise", () => {
    const withCounts = normalizeFundSniffer(ISIN, {
      ...payload,
      holdingsCount: 1252,
      riskRating: 6,
    });
    expect(withCounts.holdingsCount).toBe(1252);
    expect(withCounts.riskRating).toBe(6);

    const without = normalizeFundSniffer(ISIN, payload);
    expect(without.holdingsCount).toBeUndefined();
    expect(without.riskRating).toBeUndefined();
  });

  it("sorts holdings by weight, drops malformed rows and computes coverage", () => {
    const info = normalizeFundSniffer("IE00B4L5Y983", payload);

    expect(info.topHoldings.map((h) => h.name)).toEqual(["NVIDIA", "APPLE", "Unknown"]);
    expect(info.topHoldings[0]?.isin).toBe("US67066G1040");
    expect(info.coverage).toBeCloseTo((5.54 + 5.24 + 1.1) / 100, 5);
  });

  it("parses breakdowns, drops blank labels", () => {
    const info = normalizeFundSniffer("IE00B4L5Y983", payload);

    expect(info.breakdowns?.sector.map((s) => s.label)).toEqual(["Information Technology"]);
    expect(info.breakdowns?.geography[0]).toEqual({ label: "United States", weight: 72.29 });
  });

  it("survives an empty payload", () => {
    const info = normalizeFundSniffer("XX0000000000", {});

    expect(info.isin).toBe("XX0000000000");
    expect(info.name).toBe("XX0000000000");
    expect(info.topHoldings).toEqual([]);
    expect(info.coverage).toBe(0);
    expect(info.breakdowns).toEqual({ sector: [], geography: [] });
  });
});

describe("createFundSnifferProvider", () => {
  const baseUrl = "http://localhost:8484";

  it("fetches the ISIN from the FundSniffer backend", async () => {
    const fetchImpl = fetchReturning(payload);
    const provider = createFundSnifferProvider(fetchImpl, { baseUrl });

    const info = await provider.getFund(ISIN);
    expect(info?.name).toBe("iShares Core MSCI World UCITS ETF");

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe(`${baseUrl}/fund/${ISIN}`);
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });

  it.each([400, 404])("returns null for a %i response", async (status) => {
    const provider = createFundSnifferProvider(fetchReturning(null, status), { baseUrl });
    expect(await provider.getFund(ISIN)).toBeNull();
  });

  it.each([502, 503, 504])("throws for a %i transient response", async (status) => {
    const provider = createFundSnifferProvider(fetchReturning(null, status), { baseUrl });
    await expect(provider.getFund(ISIN)).rejects.toThrow(
      `FundSniffer responded ${status} for ${ISIN}`,
    );
  });
});
