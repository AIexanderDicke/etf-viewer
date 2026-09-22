// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Position } from "../../shared/types.ts";
import {
  buildPortfolioExport,
  downloadJson,
  parsePortfolioImport,
  portfolioExportFilename,
} from "../../src/transfer.ts";

const WORLD = "IE00B4L5Y983";

function position(overrides: Partial<Position>): Position {
  return {
    id: overrides.id ?? "p1",
    portfolioId: overrides.portfolioId ?? "portfolio-1",
    kind: overrides.kind ?? "cash",
    isin: overrides.isin ?? "",
    name: overrides.name ?? "",
    bank: overrides.bank ?? "",
    interestRate: overrides.interestRate,
    amount: overrides.amount ?? 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildPortfolioExport", () => {
  it("maps positions and drops identifiers and empty fields", () => {
    const result = buildPortfolioExport(
      "Core",
      [
        position({ kind: "etf", isin: WORLD, name: "World", amount: 1000 }),
        position({ kind: "cash", bank: "ING", interestRate: 2.5, amount: 500 }),
        position({ kind: "cash", amount: 100 }),
      ],
      new Date("2026-02-01T00:00:00.000Z"),
    );

    expect(result).toEqual({
      format: "etf-viewer.portfolio",
      version: 1,
      portfolio: "Core",
      exportedAt: "2026-02-01T00:00:00.000Z",
      positions: [
        { kind: "etf", amount: 1000, isin: WORLD, name: "World" },
        { kind: "cash", amount: 500, bank: "ING", interestRate: 2.5 },
        { kind: "cash", amount: 100 },
      ],
    });
  });
});

describe("portfolioExportFilename", () => {
  it("slugifies the portfolio name", () => {
    expect(portfolioExportFilename("Core Portfolio")).toBe("core-portfolio-positions.json");
  });

  it("falls back when the name has no usable characters", () => {
    expect(portfolioExportFilename("  ")).toBe("portfolio-positions.json");
  });
});

describe("parsePortfolioImport", () => {
  it("parses an export envelope", () => {
    const result = parsePortfolioImport(
      JSON.stringify({
        format: "etf-viewer.portfolio",
        portfolio: " Core ",
        positions: [
          { kind: "etf", isin: WORLD.toLowerCase(), name: " World ", amount: 1000 },
          { kind: "cash", bank: " ING ", interestRate: 2.5, amount: 500 },
          { kind: "cash", amount: 100 },
        ],
      }),
    );

    expect(result.portfolio).toBe("Core");
    expect(result.positions).toEqual([
      { kind: "etf", isin: WORLD, name: "World", amount: 1000 },
      { kind: "cash", isin: "", name: "", bank: "ING", interestRate: 2.5, amount: 500 },
      { kind: "cash", isin: "", name: "", bank: "", interestRate: undefined, amount: 100 },
    ]);
  });

  it("accepts a bare array without a portfolio name", () => {
    expect(parsePortfolioImport('[{"kind":"cash","amount":5}]')).toEqual({
      portfolio: "",
      positions: [
        { kind: "cash", isin: "", name: "", bank: "", interestRate: undefined, amount: 5 },
      ],
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePortfolioImport("nope")).toThrow(/not valid JSON/);
  });

  it("rejects a file without a positions list", () => {
    expect(() => parsePortfolioImport('{"hello":"world"}')).toThrow(/portfolio JSON export/);
  });

  it("rejects an empty positions list", () => {
    expect(() => parsePortfolioImport('{"positions":[]}')).toThrow(/no positions/);
  });

  it("rejects malformed positions with a numbered message", () => {
    expect(() => parsePortfolioImport("[42]")).toThrow(/Position 1 must be an object/);
    expect(() => parsePortfolioImport('[{"kind":"gold","amount":1}]')).toThrow(
      /Position 1 has an invalid kind/,
    );
    expect(() => parsePortfolioImport('[{"kind":"cash","amount":0}]')).toThrow(
      /Position 1 needs an amount/,
    );
    expect(() => parsePortfolioImport('[{"kind":"etf","isin":"BAD","amount":1}]')).toThrow(
      /Position 1 has an invalid ISIN/,
    );
    expect(() => parsePortfolioImport('[{"kind":"cash","amount":1,"interestRate":-1}]')).toThrow(
      /Position 1 has an invalid interest rate/,
    );
  });
});

describe("downloadJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serializes the payload into a downloaded blob", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadJson({ hello: "world" }, "export.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual({ hello: "world" });
    expect(click).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
