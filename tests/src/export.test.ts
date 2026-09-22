import { describe, expect, it } from "vitest";
import { exportFilename } from "../../src/export.ts";

describe("exportFilename", () => {
  it("slugifies the portfolio name", () => {
    expect(exportFilename("Core Portfolio")).toBe("core-portfolio-allocation.png");
  });

  it("collapses punctuation and trims separators", () => {
    expect(exportFilename("  My / ETF's 2026! ")).toBe("my-etf-s-2026-allocation.png");
  });

  it("falls back when the name has no usable characters", () => {
    expect(exportFilename("...")).toBe("portfolio-allocation.png");
    expect(exportFilename("   ")).toBe("portfolio-allocation.png");
  });
});
