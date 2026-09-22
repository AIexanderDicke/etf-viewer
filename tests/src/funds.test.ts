import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundInfo } from "../../shared/types.ts";

const apiMock = vi.hoisted(() => ({
  listPositions: vi.fn(),
  addPosition: vi.fn(),
  updatePosition: vi.fn(),
  removePosition: vi.fn(),
  getFund: vi.fn(),
}));

vi.mock("../../src/api.ts", () => ({ api: apiMock }));

const ISIN = "IE00B4L5Y983";

function fund(name: string): FundInfo {
  return { isin: ISIN, name, source: "test", stale: false, topHoldings: [], coverage: 0 };
}

async function freshFunds() {
  vi.resetModules();
  return import("../../src/funds.ts");
}

describe("fund state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports idle for an unknown ISIN", async () => {
    const funds = await freshFunds();
    expect(funds.getFundState(ISIN)).toEqual({ status: "idle" });
  });

  it("loads a fund once and caches the result", async () => {
    const funds = await freshFunds();
    apiMock.getFund.mockResolvedValue(fund("World"));

    const first = await funds.loadFund(ISIN);
    const second = await funds.loadFund(ISIN);

    expect(first).toEqual(fund("World"));
    expect(second).toBe(first);
    expect(apiMock.getFund).toHaveBeenCalledOnce();
    expect(funds.getFundState(ISIN)).toMatchObject({ status: "ready", info: fund("World") });
  });

  it("shares an in-flight request between concurrent callers", async () => {
    const funds = await freshFunds();
    let resolve!: (info: FundInfo) => void;
    apiMock.getFund.mockReturnValue(
      new Promise<FundInfo>((resolvePromise) => {
        resolve = resolvePromise;
      }),
    );

    const first = funds.loadFund(ISIN);
    const second = funds.loadFund(ISIN);
    expect(apiMock.getFund).toHaveBeenCalledOnce();
    expect(second).toBe(first);

    resolve(fund("World"));
    await expect(first).resolves.toEqual(fund("World"));
  });

  it("records an error and allows a retry", async () => {
    const funds = await freshFunds();
    apiMock.getFund.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(fund("World"));

    await expect(funds.loadFund(ISIN)).rejects.toThrow("nope");
    expect(funds.getFundState(ISIN)).toMatchObject({ status: "error", error: "nope" });

    await expect(funds.loadFund(ISIN)).resolves.toEqual(fund("World"));
    expect(apiMock.getFund).toHaveBeenCalledTimes(2);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    const funds = await freshFunds();
    apiMock.getFund.mockRejectedValueOnce("exploded");

    await expect(funds.loadFund(ISIN)).rejects.toBe("exploded");
    expect(funds.getFundState(ISIN)).toMatchObject({ status: "error", error: "Unknown error" });
  });

  it("starts exactly one lookup per ISIN via ensureFund", async () => {
    const funds = await freshFunds();
    apiMock.getFund.mockResolvedValue(fund("World"));

    funds.ensureFund(ISIN);
    funds.ensureFund(ISIN);
    expect(apiMock.getFund).toHaveBeenCalledOnce();

    await vi.waitFor(() => expect(funds.getFundState(ISIN).status).toBe("ready"));
    funds.ensureFund(ISIN);
    expect(apiMock.getFund).toHaveBeenCalledOnce();
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const funds = await freshFunds();
    apiMock.getFund.mockResolvedValue(fund("World"));
    const listener = vi.fn();
    const unsubscribe = funds.subscribeFunds(listener);

    await funds.loadFund(ISIN);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    await funds.loadFund("IE00B5BMR087").catch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
  });
});
