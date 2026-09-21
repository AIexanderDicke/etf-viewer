import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Position, PositionInput } from "../shared/types.ts";

const apiMock = vi.hoisted(() => ({
  listPositions: vi.fn(),
  addPosition: vi.fn(),
  updatePosition: vi.fn(),
  removePosition: vi.fn(),
  getFund: vi.fn(),
}));

vi.mock("./api.ts", () => ({ api: apiMock }));

function position(id: string, amount: number): Position {
  return {
    id,
    kind: "cash",
    isin: "",
    name: "",
    bank: "",
    amount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function freshStore() {
  vi.resetModules();
  return import("./store.ts");
}

describe("store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies subscribers until they unsubscribe", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({ status: "loading", positions: [] });

    unsubscribe();
    listener.mockClear();
    apiMock.listPositions.mockResolvedValue([]);
    await store.init();

    expect(listener).not.toHaveBeenCalled();
  });

  it("loads positions and settles into ready", async () => {
    const store = await freshStore();
    apiMock.listPositions.mockResolvedValue([position("p1", 100)]);
    const states: string[] = [];
    store.subscribe((state) => states.push(state.status));

    await store.init();

    expect(apiMock.listPositions).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ status: "ready", error: undefined });
    expect(states).toContain("loading");
    expect(states.at(-1)).toBe("ready");
  });

  it("reports a backend failure", async () => {
    const store = await freshStore();
    apiMock.listPositions.mockRejectedValue(new Error("boom"));

    await store.init();

    expect(store.getState()).toMatchObject({ status: "error", error: "boom" });
  });

  it("reports a non-Error rejection with a fallback message", async () => {
    const store = await freshStore();
    apiMock.listPositions.mockRejectedValue("nope");

    await store.init();

    expect(store.getState().error).toBe("Unexpected error");
  });

  it("creates a position then refreshes", async () => {
    const store = await freshStore();
    apiMock.addPosition.mockResolvedValue(position("p2", 200));
    apiMock.listPositions.mockResolvedValue([position("p2", 200)]);
    const input: PositionInput = { kind: "cash", amount: 200 };

    await store.addPosition(input);

    expect(apiMock.addPosition).toHaveBeenCalledWith(input);
    expect(store.getState().positions).toEqual([position("p2", 200)]);
  });

  it("removes a position then refreshes", async () => {
    const store = await freshStore();
    apiMock.removePosition.mockResolvedValue(undefined);
    apiMock.listPositions.mockResolvedValue([]);

    await store.removePosition("p1");

    expect(apiMock.removePosition).toHaveBeenCalledWith("p1");
    expect(store.getState().positions).toEqual([]);
  });
});
