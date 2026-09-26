import { describe, expect, it } from "vitest";
import { euro, integer, percent } from "../../../src/ui/format.ts";

describe("formatters", () => {
  it("formats euro amounts in de-DE", () => {
    const text = euro.format(1234.5);
    expect(text).toContain("1.234,50");
    expect(text).toContain("€");
  });

  it("formats percentages with at most one decimal", () => {
    expect(percent.format(12.34)).toBe("12,3");
    expect(percent.format(100)).toBe("100");
  });

  it("formats integers with thousands grouping", () => {
    expect(integer.format(1252)).toBe("1.252");
  });
});
