import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio, Position, PositionInput } from "../../shared/types.ts";

const apiMock = vi.hoisted(() => ({
  listPortfolios: vi.fn(),
  createPortfolio: vi.fn(),
  renamePortfolio: vi.fn(),
  listPositions: vi.fn(),
  addPosition: vi.fn(),
  updatePosition: vi.fn(),
  removePosition: vi.fn(),
  getFund: vi.fn(),
}));

vi.mock("../../src/api.ts", () => ({ api: apiMock }));

function portfolio(id: string, name = ""): Portfolio {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function position(id: string, amount: number, portfolioId = "portfolio-1"): Position {
  return {
    id,
    portfolioId,
    kind: "cash",
    isin: "",
    name: "",
    bank: "",
    source: "",
    amount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function freshStore() {
  vi.resetModules();
  return import("../../src/store.ts");
}

describe("store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1")]);
    apiMock.listPositions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies subscribers until they unsubscribe", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({
      status: "loading",
      portfolios: [],
      activePortfolioId: null,
      positions: [],
    });

    unsubscribe();
    listener.mockClear();
    await store.init();

    expect(listener).not.toHaveBeenCalled();
  });

  it("loads portfolios and the active portfolio's positions", async () => {
    const store = await freshStore();
    apiMock.listPositions.mockResolvedValue([position("p1", 100)]);
    const states: string[] = [];
    store.subscribe((state) => states.push(state.status));

    await store.init();

    expect(apiMock.listPositions).toHaveBeenCalledWith("portfolio-1");
    expect(store.getState()).toMatchObject({
      status: "ready",
      activePortfolioId: "portfolio-1",
      portfolios: [portfolio("portfolio-1")],
      positions: [position("p1", 100)],
      error: undefined,
    });
    expect(states).toContain("loading");
    expect(states.at(-1)).toBe("ready");
  });

  it("remembers the selected portfolio", async () => {
    const remembered = new Map([["etf-viewer:active-portfolio", "portfolio-2"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => remembered.get(key) ?? null,
      setItem: (key: string, value: string) => remembered.set(key, value),
      removeItem: (key: string) => remembered.delete(key),
    });
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1"), portfolio("portfolio-2")]);

    await store.init();

    expect(store.getState().activePortfolioId).toBe("portfolio-2");
    expect(apiMock.listPositions).toHaveBeenCalledWith("portfolio-2");
  });

  it("survives unavailable storage", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const store = await freshStore();

    await store.init();
    await store.setActivePortfolio("portfolio-2");

    expect(store.getState().status).toBe("ready");
  });

  it("reports a backend failure", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockRejectedValue(new Error("boom"));

    await store.init();

    expect(store.getState()).toMatchObject({ status: "error", error: "boom" });
  });

  it("reports a non-Error rejection with a fallback message", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockRejectedValue("nope");

    await store.init();

    expect(store.getState().error).toBe("Unexpected error");
  });

  it("creates a position in the active portfolio then refreshes", async () => {
    const store = await freshStore();
    await store.init();
    const input: PositionInput = { kind: "cash", amount: 200 };
    apiMock.addPosition.mockResolvedValue(position("p2", 200));
    apiMock.listPositions.mockResolvedValue([position("p2", 200)]);

    await store.addPosition(input);

    expect(apiMock.addPosition).toHaveBeenCalledWith(input, "portfolio-1");
    expect(store.getState().positions).toEqual([position("p2", 200)]);
  });

  it("refuses to add without an active portfolio", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([]);
    await store.init();

    await expect(store.addPosition({ kind: "cash", amount: 1 })).rejects.toThrow(
      "No active portfolio",
    );
  });

  it("imports several positions with a single refresh", async () => {
    const store = await freshStore();
    await store.init();
    apiMock.listPositions.mockClear();
    apiMock.listPositions.mockResolvedValue([position("p2", 200), position("p3", 300)]);

    await store.importPositions([
      { kind: "cash", amount: 200 },
      { kind: "cash", amount: 300 },
    ]);

    expect(apiMock.addPosition).toHaveBeenNthCalledWith(
      1,
      { kind: "cash", amount: 200 },
      "portfolio-1",
    );
    expect(apiMock.addPosition).toHaveBeenNthCalledWith(
      2,
      { kind: "cash", amount: 300 },
      "portfolio-1",
    );
    expect(apiMock.listPositions).toHaveBeenCalledTimes(1);
    expect(store.getState().positions).toHaveLength(2);
  });

  it("refuses to import without an active portfolio", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([]);
    await store.init();

    await expect(store.importPositions([{ kind: "cash", amount: 1 }])).rejects.toThrow(
      "No active portfolio",
    );
  });

  it("imports into a fresh portfolio and switches to it", async () => {
    const store = await freshStore();
    await store.init();
    apiMock.createPortfolio.mockResolvedValue(portfolio("portfolio-9", "Imported"));
    apiMock.listPositions.mockResolvedValue([position("p9", 200, "portfolio-9")]);

    const created = await store.importPortfolio("Imported", [{ kind: "cash", amount: 200 }]);

    expect(apiMock.createPortfolio).toHaveBeenCalledWith("Imported");
    expect(apiMock.addPosition).toHaveBeenCalledWith({ kind: "cash", amount: 200 }, "portfolio-9");
    expect(created.id).toBe("portfolio-9");
    expect(store.getState().activePortfolioId).toBe("portfolio-9");
  });

  it("makes room for a duplicate import name", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1", "Core")]);
    await store.init();
    apiMock.createPortfolio.mockResolvedValue(portfolio("portfolio-2", "Core (2)"));

    await store.importPortfolio("Core", [{ kind: "cash", amount: 1 }]);

    expect(apiMock.createPortfolio).toHaveBeenCalledWith("Core (2)");
  });

  it("names an unnamed import", async () => {
    const store = await freshStore();
    await store.init();
    apiMock.createPortfolio.mockResolvedValue(portfolio("portfolio-2", "Imported portfolio"));

    await store.importPortfolio("", [{ kind: "cash", amount: 1 }]);

    expect(apiMock.createPortfolio).toHaveBeenCalledWith("Imported portfolio");
  });

  it("removes a position then refreshes", async () => {
    const store = await freshStore();
    await store.init();

    await store.removePosition("p1");

    expect(apiMock.removePosition).toHaveBeenCalledWith("p1");
    expect(store.getState().positions).toEqual([]);
  });

  it("switches the active portfolio", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1"), portfolio("portfolio-2")]);
    await store.init();
    apiMock.listPositions.mockResolvedValue([position("p9", 50, "portfolio-2")]);

    await store.setActivePortfolio("portfolio-2");

    expect(apiMock.listPositions).toHaveBeenCalledWith("portfolio-2");
    expect(store.getState().activePortfolioId).toBe("portfolio-2");
    expect(store.getState().positions).toEqual([position("p9", 50, "portfolio-2")]);
  });

  it("reports a failure while switching portfolios", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1"), portfolio("portfolio-2")]);
    await store.init();
    apiMock.listPositions.mockRejectedValue(new Error("down"));

    await store.setActivePortfolio("portfolio-2");

    expect(store.getState()).toMatchObject({ status: "error", error: "down" });
  });

  it("creates a portfolio and switches to it", async () => {
    const store = await freshStore();
    await store.init();
    apiMock.createPortfolio.mockResolvedValue(portfolio("portfolio-3"));

    const created = await store.createPortfolio("New");

    expect(apiMock.createPortfolio).toHaveBeenCalledWith("New");
    expect(store.getState().portfolios).toContainEqual(portfolio("portfolio-3"));
    expect(store.getState().activePortfolioId).toBe("portfolio-3");
    expect(created.id).toBe("portfolio-3");
  });

  it("renames a portfolio in place", async () => {
    const store = await freshStore();
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1", "Old")]);
    await store.init();
    apiMock.renamePortfolio.mockResolvedValue(portfolio("portfolio-1", "New"));

    await store.renamePortfolio("portfolio-1", "New");

    expect(apiMock.renamePortfolio).toHaveBeenCalledWith("portfolio-1", "New");
    expect(store.getState().portfolios).toEqual([portfolio("portfolio-1", "New")]);
  });
});
