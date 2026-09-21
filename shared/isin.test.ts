import { describe, expect, it } from "vitest";
import { isValidIsin, normalizeIsin } from "./isin.ts";

describe("isValidIsin", () => {
  it("accepts well-formed ISINs with a correct check digit", () => {
    expect(isValidIsin("IE00B4L5Y983")).toBe(true);
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin("IE00B5BMR087")).toBe(true);
  });

  it("normalises case and surrounding whitespace", () => {
    expect(isValidIsin("  ie00b4l5y983 ")).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(isValidIsin("BAD")).toBe(false);
    expect(isValidIsin("IE00B4L5Y98")).toBe(false);
    expect(isValidIsin("IE00B4L5Y98X")).toBe(false);
    expect(isValidIsin("")).toBe(false);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidIsin("IE00B4L5Y984")).toBe(false);
    expect(isValidIsin("US0378331004")).toBe(false);
  });
});

describe("normalizeIsin", () => {
  it("trims and upper-cases", () => {
    expect(normalizeIsin(" ie00b4l5y983 ")).toBe("IE00B4L5Y983");
  });
});
