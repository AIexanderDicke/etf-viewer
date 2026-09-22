import { describe, expect, it } from "vitest";
import { createSnapshotProvider, snapshotIsins } from "../../../server/holdings/snapshot.ts";

describe("snapshot provider", () => {
  const provider = createSnapshotProvider();

  it("resolves a bundled ISIN case-insensitively", async () => {
    const info = await provider.getFund("ie00b4l5y983");
    expect(info?.name).toContain("MSCI World");
    expect(info?.source).toBe("Bundled snapshot");
    expect(info?.topHoldings.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown ISIN", async () => {
    expect(await provider.getFund("US0378331005")).toBeNull();
  });

  it("hands out isolated copies", async () => {
    const first = await provider.getFund("IE00B4L5Y983");
    first!.topHoldings.push({ name: "MUTATED", weight: 1 });

    const second = await provider.getFund("IE00B4L5Y983");
    expect(second?.topHoldings.some((holding) => holding.name === "MUTATED")).toBe(false);
  });

  it("lists every bundled ISIN", () => {
    expect(snapshotIsins()).toEqual(
      expect.arrayContaining(["IE00B4L5Y983", "IE00B5BMR087", "IE00BKM4GZ66"]),
    );
  });
});
