// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FundInfo, Portfolio, Position, PositionInput } from "../../shared/types.ts";
import { euro } from "../../src/format.ts";

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

const chartMock = vi.hoisted(() => ({ update: vi.fn(), resize: vi.fn(), destroy: vi.fn() }));

vi.mock("../../src/chart.ts", () => ({
  createAllocationChart: () => chartMock,
  createDoughnut: () => chartMock,
  allocationColors: (allocations: unknown[]) => allocations.map(() => "#000000"),
}));

const exportMock = vi.hoisted(() => ({ exportPortfolioPng: vi.fn() }));

vi.mock("../../src/export.ts", () => exportMock);

const WORLD = "IE00B4L5Y983";
const EM = "IE00BKM4GZ66";

function portfolio(id: string, name = ""): Portfolio {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function position(overrides: Partial<Position>): Position {
  return {
    id: overrides.id ?? "p1",
    portfolioId: overrides.portfolioId ?? "portfolio-1",
    kind: overrides.kind ?? "cash",
    isin: overrides.isin ?? "",
    name: overrides.name ?? "",
    bank: overrides.bank ?? "",
    interestRate: overrides.interestRate,
    amount: overrides.amount ?? 1000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function fundInfo(overrides: Partial<FundInfo> = {}): FundInfo {
  return {
    isin: WORLD,
    name: "iShares Core MSCI World UCITS ETF",
    currency: "USD",
    ter: "0.20%",
    holdingsCount: 1252,
    source: "test",
    stale: false,
    topHoldings: [{ name: "NVIDIA", weight: 5.5 }],
    coverage: 0.055,
    breakdowns: {
      sector: [{ label: "Technology", weight: 30 }],
      geography: [{ label: "United States", weight: 70 }],
    },
    ...overrides,
  };
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function input(id: string): HTMLInputElement {
  return byId(id) as HTMLInputElement;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mount(): Promise<void> {
  const { mountApp } = await import("../../src/ui.ts");
  mountApp(byId("app"));
  await flush();
  await flush();
}

function clickTab(tab: string): void {
  const button = document.querySelector<HTMLButtonElement>(`button[data-tab="${tab}"]`);
  if (!button) throw new Error(`Missing tab ${tab}`);
  button.click();
}

function submitForm(): void {
  (byId("position-form") as HTMLFormElement).dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
}

function savePortfolioName(value: string): void {
  input("portfolio-name").value = value;
  byId("save-portfolio").click();
}

describe("mountApp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    window.confirm = vi.fn(() => true);
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1")]);
    apiMock.listPositions.mockResolvedValue([]);
    apiMock.addPosition.mockResolvedValue(position({}));
    apiMock.updatePosition.mockResolvedValue(position({}));
    apiMock.removePosition.mockResolvedValue(undefined);
    apiMock.getFund.mockResolvedValue(fundInfo());
  });

  it("renders the empty portfolio state", async () => {
    await mount();

    expect(byId("list-loading").hidden).toBe(true);
    expect(byId("list-empty").hidden).toBe(false);
    expect(byId("chart-empty").hidden).toBe(false);
    expect(byId("legend-empty").hidden).toBe(false);
    expect(byId("allocation-meta").textContent).toBe("");
    expect((byId("export-png") as HTMLButtonElement).disabled).toBe(true);
  });

  it("tracks the active tab with aria-selected", async () => {
    await mount();

    expect(byId("tab-portfolio").getAttribute("aria-selected")).toBe("true");
    clickTab("lookthrough");
    expect(byId("tab-portfolio").getAttribute("aria-selected")).toBe("false");
    expect(byId("tab-lookthrough").getAttribute("aria-selected")).toBe("true");
  });

  it("switches between the three tabs", async () => {
    await mount();

    clickTab("config");
    expect(byId("view-config").hidden).toBe(false);
    expect(byId("view-portfolio").hidden).toBe(true);

    clickTab("lookthrough");
    expect(byId("view-lookthrough").hidden).toBe(false);
    expect(byId("view-config").hidden).toBe(true);

    clickTab("portfolio");
    expect(byId("view-portfolio").hidden).toBe(false);
    expect(byId("view-lookthrough").hidden).toBe(true);
  });

  it("renders the portfolio picker and switches portfolios", async () => {
    apiMock.listPortfolios.mockResolvedValue([
      portfolio("portfolio-1", "Core"),
      portfolio("portfolio-2"),
    ]);
    await mount();

    const select = byId("portfolio-select") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.textContent).toBe("Core");
    expect(select.options[1]?.textContent).toBe("Unnamed portfolio");
    expect(select.value).toBe("portfolio-1");

    select.value = "portfolio-2";
    select.dispatchEvent(new Event("change"));
    await flush();

    expect(apiMock.listPositions).toHaveBeenCalledWith("portfolio-2");
  });

  it("names the current portfolio from the name field", async () => {
    apiMock.renamePortfolio.mockResolvedValue(portfolio("portfolio-1", "Retirement"));
    await mount();

    savePortfolioName("Retirement");
    await flush();

    expect(apiMock.renamePortfolio).toHaveBeenCalledWith("portfolio-1", "Retirement");
  });

  it("starts a new portfolio with an auto-numbered default name", async () => {
    apiMock.createPortfolio.mockResolvedValue(portfolio("portfolio-2", "Portfolio 1"));
    await mount();

    byId("new-portfolio").click();
    await flush();
    await flush();

    expect(apiMock.createPortfolio).toHaveBeenCalledWith("");
    expect(apiMock.listPositions).toHaveBeenCalledWith("portfolio-2");
    expect((byId("portfolio-select") as HTMLSelectElement).value).toBe("portfolio-2");
    expect(byId("portfolio-warning").hidden).toBe(false);
  });

  it("rejects a duplicate portfolio name", async () => {
    apiMock.listPortfolios.mockResolvedValue([
      portfolio("portfolio-1", "Core"),
      portfolio("portfolio-2", "Retirement"),
    ]);
    await mount();

    const name = input("portfolio-name");
    expect(name.value).toBe("Core");

    savePortfolioName("retirement");
    await flush();

    expect(apiMock.renamePortfolio).not.toHaveBeenCalled();
    expect(name.value).toBe("Core");
    expect(byId("portfolio-warning").hidden).toBe(false);
    expect(byId("portfolio-warning").textContent).toContain("already used");
  });

  it("warns while the active portfolio uses the default name", async () => {
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1", "Core")]);
    await mount();

    const warning = byId("portfolio-warning");
    expect(warning.hidden).toBe(true);
    expect(input("portfolio-name").classList.contains("is-default")).toBe(false);

    apiMock.renamePortfolio.mockResolvedValue(portfolio("portfolio-1", "Portfolio 3"));
    savePortfolioName("Portfolio 3");
    await flush();

    expect(warning.hidden).toBe(false);
    expect(input("portfolio-name").classList.contains("is-default")).toBe(true);
  });

  it("renders positions, legend metadata and removes one", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 6000 }),
      position({ id: "cash-1", kind: "cash", amount: 2000, bank: "ING", interestRate: 2.5 }),
    ]);
    await mount();
    await flush();

    expect(byId("positions-meta").textContent).toContain("2 positions");
    expect(byId("allocation-meta").textContent).toContain("2 positions");
    expect(byId("allocation-chart").getAttribute("aria-label")).toContain("2 positions");
    expect(byId("allocation-legend").textContent).toContain("TER 0.20%");
    expect(byId("allocation-legend").textContent).toContain("Cash · ING");

    const remove = document.querySelector<HTMLButtonElement>('button[data-action="remove"]');
    remove?.click();
    await flush();

    expect(apiMock.removePosition).toHaveBeenCalledWith("etf-1");
  });

  it("exports the doughnut and allocation table as a PNG", async () => {
    apiMock.listPortfolios.mockResolvedValue([portfolio("portfolio-1", "Core")]);
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 6000 }),
      position({ id: "cash-1", kind: "cash", amount: 2000, bank: "ING", interestRate: 2.5 }),
    ]);
    await mount();
    await flush();

    const button = byId("export-png") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();

    expect(exportMock.exportPortfolioPng).toHaveBeenCalledTimes(1);
    const payload = exportMock.exportPortfolioPng.mock.calls[0]?.[0];
    expect(payload.title).toBe("Core");
    expect(payload.total).toBe(euro.format(8000));
    expect(payload.chart).toBe(byId("allocation-chart"));
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toMatchObject({
      label: "iShares Core MSCI World UCITS ETF",
      color: "#000000",
      amount: 6000,
    });
    expect(payload.rows[1]).toMatchObject({ label: "Cash · ING", amount: 2000 });
  });

  it("falls back to a generic title when the portfolio is unnamed", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "cash-1", kind: "cash", amount: 2000 }),
    ]);
    await mount();
    await flush();

    (byId("export-png") as HTMLButtonElement).click();

    expect(exportMock.exportPortfolioPng).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Portfolio" }),
    );
  });

  it("expands and collapses fund details", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 6000 }),
    ]);
    await mount();
    await flush();

    const toggle = document.querySelector<HTMLButtonElement>('button[data-action="toggle"]');
    toggle?.click();
    await flush();

    expect(document.querySelector(".details-row")).not.toBeNull();
    expect(document.querySelector(".holdings")?.textContent).toContain("NVIDIA");

    document.querySelector<HTMLButtonElement>('button[data-action="toggle"]')?.click();
    expect(document.querySelector(".details-row")).toBeNull();
  });

  it("edits a position and can clear its interest rate", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "cash-1", kind: "cash", amount: 2000, bank: "ING", interestRate: 2.5 }),
    ]);
    await mount();

    document.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.click();
    expect(byId("form-title").textContent).toBe("Edit position");
    expect((byId("kind") as HTMLSelectElement).value).toBe("cash");
    expect(input("amount").value).toBe("2000");
    expect(input("bank").value).toBe("ING");
    expect(input("interest").value).toBe("2.5");
    expect(byId("cancel-edit").hidden).toBe(false);

    input("interest").value = "";
    submitForm();
    await flush();

    expect(apiMock.updatePosition).toHaveBeenCalledWith("cash-1", {
      kind: "cash",
      isin: "",
      name: "",
      bank: "ING",
      interestRate: null,
      amount: 2000,
    });
    expect(apiMock.addPosition).not.toHaveBeenCalled();
    expect(byId("form-title").textContent).toBe("Add position");
    expect(byId("cancel-edit").hidden).toBe(true);
  });

  it("edits an ETF position", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 6000, name: "World" }),
    ]);
    await mount();

    document.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.click();
    expect(input("isin").value).toBe(WORLD);
    expect(byId("form-title").textContent).toBe("Edit position");

    input("amount").value = "7000";
    submitForm();
    await flush();

    expect(apiMock.updatePosition).toHaveBeenCalledWith("etf-1", {
      kind: "etf",
      isin: WORLD,
      name: "iShares Core MSCI World UCITS ETF",
      bank: "",
      interestRate: null,
      amount: 7000,
    });
  });

  it("surfaces a save failure", async () => {
    await mount();
    apiMock.addPosition.mockRejectedValue(new Error("nope"));

    input("amount").value = "1000";
    input("isin").value = WORLD;
    submitForm();
    await flush();

    expect(byId("form-error").textContent).toContain("nope");
  });

  it("cancels editing without saving", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "cash-1", kind: "cash", amount: 2000, bank: "ING" }),
    ]);
    await mount();

    document.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.click();
    byId("cancel-edit").click();

    expect(byId("form-title").textContent).toBe("Add position");
    expect(input("amount").value).toBe("");
    expect((byId("kind") as HTMLSelectElement).value).toBe("etf");
    expect(apiMock.updatePosition).not.toHaveBeenCalled();
  });

  it("asks for confirmation before removing", async () => {
    apiMock.listPositions.mockResolvedValue([
      position({ id: "cash-1", kind: "cash", amount: 2000, bank: "ING" }),
    ]);
    await mount();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    document.querySelector<HTMLButtonElement>('button[data-action="remove"]')?.click();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ING"));
    expect(apiMock.removePosition).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    document.querySelector<HTMLButtonElement>('button[data-action="remove"]')?.click();
    await flush();
    expect(apiMock.removePosition).toHaveBeenCalledWith("cash-1");
  });

  it("adds an ETF position with the resolved fund name", async () => {
    await mount();

    input("amount").value = "1000";
    input("isin").value = WORLD;
    submitForm();
    await flush();

    const expected: PositionInput = {
      kind: "etf",
      isin: WORLD,
      name: "iShares Core MSCI World UCITS ETF",
      bank: "",
      interestRate: undefined,
      amount: 1000,
    };
    expect(apiMock.addPosition).toHaveBeenCalledWith(expected, "portfolio-1");
  });

  it("adds a cash position with bank and interest rate", async () => {
    await mount();

    const kind = byId("kind") as HTMLSelectElement;
    kind.value = "cash";
    kind.dispatchEvent(new Event("change"));
    input("amount").value = "5000";
    input("bank").value = "Deutsche Bank";
    input("interest").value = "2.5";
    submitForm();
    await flush();

    expect(apiMock.addPosition).toHaveBeenCalledWith(
      {
        kind: "cash",
        isin: "",
        name: "",
        bank: "Deutsche Bank",
        interestRate: 2.5,
        amount: 5000,
      },
      "portfolio-1",
    );
  });

  it("validates the amount, ISIN and interest rate", async () => {
    await mount();

    input("amount").value = "";
    submitForm();
    expect(byId("form-error").textContent).toMatch(/greater than 0/);

    input("amount").value = "100";
    input("isin").value = "BAD";
    submitForm();
    expect(byId("form-error").textContent).toMatch(/valid ISIN/);

    const kind = byId("kind") as HTMLSelectElement;
    kind.value = "cash";
    kind.dispatchEvent(new Event("change"));
    input("amount").value = "100";
    input("interest").value = "-1";
    submitForm();
    expect(byId("form-error").textContent).toMatch(/valid interest rate/);

    expect(apiMock.addPosition).not.toHaveBeenCalled();
  });

  it("refuses to save an ETF whose fund cannot be resolved", async () => {
    apiMock.getFund.mockRejectedValue(new Error("not found"));
    await mount();

    input("amount").value = "1000";
    input("isin").value = WORLD;
    submitForm();
    await flush();

    expect(byId("form-error").textContent).toMatch(/No fund data found/);
    expect(apiMock.addPosition).not.toHaveBeenCalled();
  });

  it("shows a backend error banner when loading fails", async () => {
    apiMock.listPositions.mockRejectedValue(new Error("down"));
    await mount();

    expect(byId("app-status").hidden).toBe(false);
    expect(byId("app-status").textContent).toContain("Backend error");
  });

  it("debounces ISIN lookups and reports the outcome", async () => {
    await mount();

    input("isin").value = "BAD";
    input("isin").dispatchEvent(new Event("input"));
    expect(byId("isin-hint").textContent).toContain("Invalid ISIN format");

    input("isin").value = "";
    input("isin").dispatchEvent(new Event("input"));
    expect(byId("isin-hint").hidden).toBe(true);

    input("isin").value = WORLD;
    input("isin").dispatchEvent(new Event("input"));
    expect(byId("isin-hint").textContent).toContain("Checking ISIN");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(byId("isin-hint").textContent).toContain("iShares Core MSCI World");

    apiMock.getFund.mockRejectedValue(new Error("nope"));
    input("isin").value = EM;
    input("isin").dispatchEvent(new Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(byId("isin-hint").textContent).toContain("No fund data found");
  });

  it("renders look-through rows for stocks, cash, other and unresolved funds", async () => {
    const holdings = Array.from({ length: 10 }, (_, index) => ({
      name: `STOCK ${index}`,
      weight: index === 9 ? 0.05 : 9,
    }));
    apiMock.getFund.mockImplementation((isin: string) =>
      isin === WORLD
        ? Promise.resolve(
            fundInfo({
              topHoldings: holdings,
              coverage: 0.8105,
              breakdowns: {
                sector: Array.from({ length: 10 }, (_, index) => ({
                  label: `Sector ${index}`,
                  weight: 9,
                })),
                geography: [{ label: "United States", weight: 100 }],
              },
            }),
          )
        : Promise.reject(new Error("no fund")),
    );
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-world", kind: "etf", isin: WORLD, amount: 6000 }),
      position({ id: "etf-em", kind: "etf", isin: EM, amount: 1000 }),
      position({ id: "cash", kind: "cash", amount: 500 }),
    ]);

    await mount();
    await flush();
    clickTab("lookthrough");

    const stocks = byId("lt-stocks").textContent ?? "";
    expect(stocks).toContain("Other stocks");
    expect(stocks).toContain("Other holdings");
    expect(stocks).toContain("Not resolved yet");
    expect(stocks).toContain("Cash");
    expect(byId("lt-coverage").textContent).toContain("Top holdings explain");

    const switchButtons = document.querySelectorAll<HTMLButtonElement>("#lt-topic-switch button");
    expect(switchButtons).toHaveLength(2);
    switchButtons[1]?.click();
    expect(byId("lt-topic-list").textContent).toContain("United States");
  });

  it("shows the topic empty hint when a fund has no breakdowns", async () => {
    apiMock.getFund.mockResolvedValue(fundInfo({ breakdowns: { sector: [], geography: [] } }));
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 1000 }),
    ]);

    await mount();
    await flush();
    clickTab("lookthrough");

    expect(byId("lt-topic-empty").hidden).toBe(false);
    expect(byId("lt-topic-switch").children).toHaveLength(0);
  });

  it("flags stale funds and funds with no published holdings", async () => {
    apiMock.getFund.mockResolvedValue(fundInfo({ stale: true, topHoldings: [], coverage: 0 }));
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 1000 }),
    ]);

    await mount();
    await flush();
    document.querySelector<HTMLButtonElement>('button[data-action="toggle"]')?.click();

    const details = document.querySelector(".fund-details");
    expect(details?.textContent).toContain("cached / stale");
    expect(details?.textContent).toContain("No holdings published");
  });

  it("surfaces fund errors inside the row and its details", async () => {
    apiMock.getFund.mockRejectedValue(new Error("offline"));
    apiMock.listPositions.mockResolvedValue([
      position({ id: "etf-1", kind: "etf", isin: WORLD, amount: 1000 }),
    ]);

    await mount();
    await flush();

    expect(document.querySelector(".asset-meta-error")?.textContent).toContain("offline");
    document.querySelector<HTMLButtonElement>('button[data-action="toggle"]')?.click();
    expect(document.querySelector(".fund-details")?.textContent).toContain("offline");
  });
});
