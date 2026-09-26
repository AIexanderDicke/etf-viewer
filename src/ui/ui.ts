import { isValidIsin } from "../../shared/isin.ts";
import { summarize } from "../../shared/portfolio.ts";
import type {
  Allocation,
  AssetKind,
  FundInfo,
  PortfolioSummary,
  Position,
  PositionInput,
} from "../../shared/types.ts";
import type { PositionPatch } from "../api.ts";
import { allocationColors, createAllocationChart } from "./chart.ts";
import { exportPortfolioPng, type ExportRow } from "./export.ts";
import { euro, integer, percent } from "./format.ts";
import * as funds from "../funds.ts";
import { createLookThroughView } from "./lookthrough.ts";
import * as store from "../store.ts";
import {
  buildPortfolioExport,
  downloadJson,
  parsePortfolioImport,
  portfolioExportFilename,
} from "../transfer.ts";

type TabId = "portfolio" | "lookthrough" | "config";

const UNNAMED_PORTFOLIO_LABEL = "Unnamed portfolio";
const DEFAULT_PORTFOLIO_NAME = /^Portfolio \d+$/i;

function isDefaultPortfolioName(name: string): boolean {
  const trimmed = name.trim();
  return !trimmed || DEFAULT_PORTFOLIO_NAME.test(trimmed);
}

const TEMPLATE = `
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 17l5-5 4 3 6-8" />
        </svg>
      </span>
      <div>
        <h1>ETF Viewer</h1>
        <p class="subtitle">Track your portfolio by ISIN</p>
      </div>
    </div>
    <div class="portfolio-controls">
      <div class="portfolio-picker">
        <span class="portfolio-picker-label">Portfolio</span>
        <div class="portfolio-input-group">
          <select id="portfolio-select" aria-label="Select portfolio"></select>
          <input id="portfolio-name" type="text" placeholder="Portfolio name" autocomplete="off" spellcheck="false" aria-label="Portfolio name" />
          <button type="button" class="ghost icon-button" id="save-portfolio" aria-label="Save portfolio name" title="Save name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8" />
              <path d="M7 3v5h8" />
            </svg>
          </button>
        </div>
      </div>
      <div class="portfolio-control-footer">
        <p class="portfolio-warning" id="portfolio-warning" role="status" hidden></p>
        <button type="button" class="portfolio-new" id="new-portfolio">+ Start new portfolio</button>
      </div>
    </div>
  </header>

  <p class="status" id="app-status" role="alert" hidden></p>

  <div class="view-bar">
    <nav class="tabs" id="tabs" role="tablist" aria-label="Portfolio views">
      <button type="button" class="tab is-active" id="tab-portfolio" role="tab" aria-selected="true" aria-controls="view-portfolio" data-tab="portfolio">Portfolio</button>
      <button type="button" class="tab" id="tab-lookthrough" role="tab" aria-selected="false" aria-controls="view-lookthrough" data-tab="lookthrough">Exposure</button>
      <button type="button" class="tab" id="tab-config" role="tab" aria-selected="false" aria-controls="view-config" data-tab="config">Positions</button>
    </nav>
    <div class="view-actions">
      <button type="button" class="action-pill" id="export-png" title="Export the allocation as a PNG" disabled>PNG</button>
      <button type="button" class="action-pill" id="export-json" title="Export the positions as JSON" disabled>Export</button>
      <button type="button" class="action-pill" id="import-json-button" title="Import a portfolio from JSON">Import</button>
      <input type="file" id="import-json" accept="application/json,.json" hidden />
    </div>
  </div>

  <section class="view" id="view-portfolio" role="tabpanel" aria-labelledby="tab-portfolio">
    <div class="dashboard">
      <section class="card chart-card">
        <div class="chart-wrap">
          <canvas id="allocation-chart" role="img" aria-label="Portfolio allocation chart"></canvas>
          <div class="chart-center" id="chart-center" hidden>
            <span class="chart-center-label">Total</span>
            <span class="chart-center-value" id="total">—</span>
          </div>
        </div>
        <p class="empty-hint" id="chart-empty" hidden>Add a position on the Positions tab to see the allocation.</p>
      </section>
      <section class="card">
        <div class="card-head">
          <h2>Allocation</h2>
          <span class="card-meta" id="allocation-meta"></span>
        </div>
        <ul class="legend" id="allocation-legend"></ul>
        <p class="empty-hint" id="legend-empty" hidden>No positions yet.</p>
      </section>
    </div>
  </section>

  <section class="layout" id="view-lookthrough" role="tabpanel" aria-labelledby="tab-lookthrough" hidden></section>

  <section class="view" id="view-config" role="tabpanel" aria-labelledby="tab-config" hidden>
    <div class="config-layout">
      <section class="card">
        <div class="card-head">
          <h2 id="form-title">Add position</h2>
        </div>
        <form id="position-form" class="position-form" novalidate>
          <div class="field">
            <label for="kind">Type</label>
            <select id="kind">
              <option value="etf">ETF</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div class="field">
            <label for="amount">Value (EUR)</label>
            <input id="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="1000" />
          </div>
          <div class="field field-isin">
            <label for="isin">ISIN</label>
            <input id="isin" type="text" placeholder="IE00B4L5Y983" autocomplete="off" spellcheck="false" />
            <p class="field-hint" id="isin-hint" role="status" hidden></p>
          </div>
          <div class="field field-cash" hidden>
            <label for="bank">Bank</label>
            <input id="bank" type="text" placeholder="Deutsche Bank · optional" autocomplete="off" />
          </div>
          <div class="field field-cash" hidden>
            <label for="interest">Interest rate</label>
            <input id="interest" type="number" min="0" step="0.01" inputmode="decimal" placeholder="2.5 · optional" />
          </div>
          <div class="form-actions">
            <button type="submit" class="primary" id="submit-button">Add position</button>
            <button type="button" class="ghost" id="cancel-edit" hidden>Cancel</button>
          </div>
          <p class="form-error" id="form-error" role="alert"></p>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Positions</h2>
          <span class="card-meta" id="positions-meta"></span>
        </div>
        <table class="positions">
          <thead>
            <tr><th>Asset</th><th class="num">Value</th><th class="num">Share</th><th></th></tr>
          </thead>
          <tbody id="position-list"></tbody>
        </table>
        <p class="empty-hint" id="list-empty" hidden>No positions yet.</p>
        <p class="empty-hint" id="list-loading">Loading positions…</p>
      </section>
    </div>
  </section>
`;

const expanded = new Set<string>();

export function mountApp(root: HTMLElement): void {
  root.innerHTML = TEMPLATE;

  const chartCanvas = get<HTMLCanvasElement>("allocation-chart");
  const chart = createAllocationChart(chartCanvas);
  const lookThroughView = createLookThroughView(get<HTMLElement>("view-lookthrough"));
  const viewPortfolio = get<HTMLElement>("view-portfolio");
  const viewLookThrough = get<HTMLElement>("view-lookthrough");
  const viewConfig = get<HTMLElement>("view-config");

  const form = get<HTMLFormElement>("position-form");
  const kindInput = get<HTMLSelectElement>("kind");
  const isinInput = get<HTMLInputElement>("isin");
  const isinHint = get<HTMLParagraphElement>("isin-hint");
  const bankInput = get<HTMLInputElement>("bank");
  const interestInput = get<HTMLInputElement>("interest");
  const amountInput = get<HTMLInputElement>("amount");
  const submitButton = get<HTMLButtonElement>("submit-button");
  const cancelEdit = get<HTMLButtonElement>("cancel-edit");
  const formTitle = get<HTMLHeadingElement>("form-title");
  const errorEl = get<HTMLParagraphElement>("form-error");
  const totalEl = get<HTMLSpanElement>("total");
  const chartCenter = get<HTMLDivElement>("chart-center");
  const listBody = get<HTMLTableSectionElement>("position-list");
  const listEmpty = get<HTMLParagraphElement>("list-empty");
  const listLoading = get<HTMLParagraphElement>("list-loading");
  const chartEmpty = get<HTMLParagraphElement>("chart-empty");
  const legendEl = get<HTMLUListElement>("allocation-legend");
  const legendEmpty = get<HTMLParagraphElement>("legend-empty");
  const allocationMeta = get<HTMLSpanElement>("allocation-meta");
  const exportPngButton = get<HTMLButtonElement>("export-png");
  const positionsMeta = get<HTMLSpanElement>("positions-meta");
  const exportJsonButton = get<HTMLButtonElement>("export-json");
  const importJsonButton = get<HTMLButtonElement>("import-json-button");
  const importJsonInput = get<HTMLInputElement>("import-json");
  const statusEl = get<HTMLParagraphElement>("app-status");
  const tabsEl = get<HTMLElement>("tabs");
  const portfolioSelect = get<HTMLSelectElement>("portfolio-select");
  const portfolioName = get<HTMLInputElement>("portfolio-name");
  const portfolioWarning = get<HTMLParagraphElement>("portfolio-warning");
  const savePortfolioButton = get<HTMLButtonElement>("save-portfolio");
  const newPortfolioButton = get<HTMLButtonElement>("new-portfolio");
  let portfolioSignature = "";
  let activeTab: TabId = "portfolio";

  const isinField = document.querySelector<HTMLDivElement>(".field-isin")!;
  const cashFields = document.querySelectorAll<HTMLDivElement>(".field-cash");

  tabsEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-tab]");
    if (button) setTab(button.dataset.tab as TabId);
  });

  function setTab(tab: TabId): void {
    activeTab = tab;
    for (const button of tabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]")) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    viewPortfolio.hidden = tab !== "portfolio";
    viewLookThrough.hidden = tab !== "lookthrough";
    viewConfig.hidden = tab !== "config";
    render();
    if (tab === "lookthrough") lookThroughView.resize();
    else if (tab === "portfolio") chart.resize();
  }

  portfolioSelect.addEventListener("change", () => {
    const id = portfolioSelect.value;
    if (!id || id === store.getState().activePortfolioId) return;
    resetForm();
    void store.setActivePortfolio(id).catch((error) => {
      errorEl.textContent = error instanceof Error ? error.message : "Could not switch portfolio.";
    });
  });

  newPortfolioButton.addEventListener("click", () => {
    void startNewPortfolio();
  });

  savePortfolioButton.addEventListener("click", () => {
    void savePortfolioName();
  });

  portfolioName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void savePortfolioName();
  });

  portfolioName.addEventListener("input", () => {
    portfolioName.classList.toggle("is-default", isDefaultPortfolioName(portfolioName.value));
  });

  async function savePortfolioName(): Promise<void> {
    const state = store.getState();
    const active = state.portfolios.find((entry) => entry.id === state.activePortfolioId);
    if (!active) return;
    const name = portfolioName.value.trim();
    if (!name || name === active.name) {
      portfolioName.value = active.name;
      renderPortfolioMessage(state);
      return;
    }
    const duplicate = state.portfolios.some(
      (entry) => entry.id !== active.id && entry.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      portfolioName.value = active.name;
      showPortfolioMessage(`"${name}" is already used by another portfolio.`, true);
      return;
    }
    savePortfolioButton.disabled = true;
    try {
      await store.renamePortfolio(active.id, name);
    } catch (error) {
      portfolioName.value = active.name;
      showPortfolioMessage(
        error instanceof Error ? error.message : "Could not rename portfolio.",
        true,
      );
    } finally {
      savePortfolioButton.disabled = false;
    }
  }

  function renderPortfolioMessage(state: store.StoreState): void {
    const active = state.portfolios.find((entry) => entry.id === state.activePortfolioId);
    const usesDefaultName = active ? isDefaultPortfolioName(active.name) : false;
    portfolioName.classList.toggle("is-default", usesDefaultName);
    portfolioWarning.classList.remove("is-error");
    portfolioWarning.hidden = !active || !usesDefaultName;
    portfolioWarning.textContent = usesDefaultName ? "This portfolio uses the default name." : "";
  }

  function showPortfolioMessage(message: string, isError = false): void {
    portfolioWarning.classList.toggle("is-error", isError);
    portfolioWarning.hidden = false;
    portfolioWarning.textContent = message;
  }

  /** Exports carry a real portfolio name; refuse while it is still unnamed. */
  function exportName(state: store.StoreState): string | null {
    const active = state.portfolios.find((entry) => entry.id === state.activePortfolioId);
    const name = active?.name.trim() ?? "";
    if (!name || isDefaultPortfolioName(name)) {
      portfolioName.focus();
      showPortfolioMessage("Save a portfolio name before exporting.", true);
      return null;
    }
    return name;
  }

  function renderPortfolios(state: store.StoreState): void {
    const signature = `${state.portfolios
      .map((portfolio) => `${portfolio.id}:${portfolio.name}`)
      .join("|")}#${state.activePortfolioId}`;
    if (signature === portfolioSignature) return;
    portfolioSignature = signature;
    portfolioSelect.replaceChildren(
      ...state.portfolios.map((portfolio) => {
        const option = document.createElement("option");
        option.value = portfolio.id;
        option.textContent = portfolio.name || UNNAMED_PORTFOLIO_LABEL;
        return option;
      }),
    );
    if (state.activePortfolioId) portfolioSelect.value = state.activePortfolioId;
    portfolioSelect.disabled = state.portfolios.length === 0;

    const active = state.portfolios.find((entry) => entry.id === state.activePortfolioId);
    portfolioName.value = active?.name ?? "";
    portfolioName.disabled = !active;
    savePortfolioButton.disabled = !active;
    renderPortfolioMessage(state);
  }

  async function startNewPortfolio(): Promise<void> {
    newPortfolioButton.disabled = true;
    try {
      await store.createPortfolio("");
      resetForm();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "Could not create portfolio.";
    } finally {
      newPortfolioButton.disabled = false;
    }
  }

  function setIsinHint(
    message: string,
    tone: "muted" | "ok" | "error" = "muted",
    info?: FundInfo,
  ): void {
    if (!message) {
      isinHint.hidden = true;
      isinHint.replaceChildren();
      return;
    }
    isinHint.hidden = false;
    isinHint.className = `field-hint${tone === "muted" ? "" : ` field-hint-${tone}`}`;
    const nodes: (Node | string)[] = [message];
    if (info) nodes.push(renderChips(info));
    isinHint.replaceChildren(...nodes);
  }

  let isinTimer: number | undefined;

  async function checkIsin(isin: string): Promise<void> {
    try {
      const info = await funds.loadFund(isin);
      if (isinInput.value.trim().toUpperCase() !== isin) return;
      setIsinHint(info.name, "ok", info);
    } catch {
      if (isinInput.value.trim().toUpperCase() !== isin) return;
      setIsinHint(`No fund data found for ${isin}. Check the ISIN.`, "error");
    }
  }

  isinInput.addEventListener("input", () => {
    window.clearTimeout(isinTimer);
    const isin = isinInput.value.trim().toUpperCase();
    if (!isin) {
      setIsinHint("");
      return;
    }
    if (!isValidIsin(isin)) {
      setIsinHint("Invalid ISIN format.", "error");
      return;
    }
    setIsinHint("Checking ISIN…");
    isinTimer = window.setTimeout(() => void checkIsin(isin), 400);
  });

  function applyKind(): void {
    const isCash = kindInput.value === "cash";
    isinField.hidden = isCash;
    for (const field of cashFields) field.hidden = !isCash;
    if (isCash) {
      isinInput.value = "";
      setIsinHint("");
    } else {
      bankInput.value = "";
      interestInput.value = "";
    }
  }

  kindInput.addEventListener("change", applyKind);

  let editingId: string | null = null;

  function resetForm(): void {
    form.reset();
    kindInput.value = "etf";
    applyKind();
    setIsinHint("");
    editingId = null;
    formTitle.textContent = "Add position";
    submitButton.textContent = "Add position";
    cancelEdit.hidden = true;
    errorEl.textContent = "";
    amountInput.focus();
  }

  function startEdit(id: string): void {
    const position = store.getState().positions.find((entry) => entry.id === id);
    if (!position) return;
    editingId = id;
    setTab("config");
    kindInput.value = position.kind;
    applyKind();
    amountInput.value = String(position.amount);
    if (position.kind === "etf") {
      isinInput.value = position.isin;
    } else {
      bankInput.value = position.bank;
      interestInput.value =
        position.interestRate !== undefined ? String(position.interestRate) : "";
    }
    formTitle.textContent = "Edit position";
    submitButton.textContent = "Save changes";
    cancelEdit.hidden = false;
    setIsinHint("");
    errorEl.textContent = "";
    amountInput.focus();
  }

  cancelEdit.addEventListener("click", resetForm);

  exportPngButton.addEventListener("click", () => {
    const state = store.getState();
    const name = exportName(state);
    if (!name) return;
    const summary = summarize(state.positions);
    exportPortfolioPng({
      title: name,
      total: euro.format(summary.total),
      chart: chartCanvas,
      rows: legendEntries(summary),
    });
  });

  exportJsonButton.addEventListener("click", () => {
    const state = store.getState();
    const name = exportName(state);
    if (!name) return;
    downloadJson(buildPortfolioExport(name, state.positions), portfolioExportFilename(name));
  });

  importJsonButton.addEventListener("click", () => importJsonInput.click());

  importJsonInput.addEventListener("change", () => {
    const file = importJsonInput.files?.[0];
    importJsonInput.value = "";
    if (file) void importPositions(file);
  });

  async function importPositions(file: File): Promise<void> {
    errorEl.textContent = "";
    try {
      const parsed = parsePortfolioImport(await file.text());
      await store.importPortfolio(parsed.portfolio, parsed.positions);
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "Could not import the file.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";

    const amount = Number.parseFloat(amountInput.value.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      errorEl.textContent = "Enter a value greater than 0.";
      amountInput.focus();
      return;
    }

    const kind = kindInput.value as AssetKind;
    const isin = isinInput.value.trim().toUpperCase();
    if (kind === "etf" && !isValidIsin(isin)) {
      errorEl.textContent = "Enter a valid ISIN (e.g. IE00B4L5Y983).";
      isinInput.focus();
      return;
    }

    const interestRaw = interestInput.value.trim();
    let interestRate: number | undefined;
    if (kind === "cash" && interestRaw) {
      interestRate = Number.parseFloat(interestRaw.replace(",", "."));
      if (!Number.isFinite(interestRate) || interestRate < 0) {
        errorEl.textContent = "Enter a valid interest rate.";
        interestInput.focus();
        return;
      }
    }

    submitButton.disabled = true;
    try {
      let name = "";
      let source = "";
      if (kind === "etf") {
        try {
          const info = await funds.loadFund(isin);
          name = info.name;
          source = info.source;
        } catch {
          errorEl.textContent = `No fund data found for ${isin}. Check the ISIN.`;
          setIsinHint(`No fund data found for ${isin}. Check the ISIN.`, "error");
          isinInput.focus();
          return;
        }
      }

      const input: PositionInput = {
        kind,
        isin: kind === "etf" ? isin : "",
        name,
        bank: kind === "cash" ? bankInput.value.trim() : "",
        interestRate,
        source,
        amount,
      };
      if (editingId) {
        // On edit an empty rate must clear the stored value, so send null.
        const patch: PositionPatch = { ...input };
        patch.interestRate = kind === "cash" ? (interestRate ?? null) : null;
        await store.updatePosition(editingId, patch);
      } else {
        await store.addPosition(input);
      }
      resetForm();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "Could not save position.";
    } finally {
      submitButton.disabled = false;
    }
  });

  listBody.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    const id = button.dataset.id!;

    if (button.dataset.action === "edit") {
      startEdit(id);
      return;
    }
    if (button.dataset.action === "remove") {
      const position = store.getState().positions.find((entry) => entry.id === id);
      if (!window.confirm(`Remove ${describePosition(position)}?`)) return;
      void store.removePosition(id).catch(() => undefined);
      return;
    }
    if (button.dataset.action === "toggle") {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
    }
  });

  function resolvedFunds(positions = store.getState().positions): Map<string, FundInfo> {
    const map = new Map<string, FundInfo>();
    for (const position of positions) {
      if (position.kind !== "etf") continue;
      const info = funds.getFundState(position.isin).info;
      if (info) map.set(position.isin.toUpperCase(), info);
    }
    return map;
  }

  function render(): void {
    const state = store.getState();
    renderPortfolios(state);

    if (state.status === "error") {
      statusEl.hidden = false;
      statusEl.textContent = `Backend error: ${state.error ?? "unknown"}. Is the API server running?`;
    } else {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }

    const summary = summarize(state.positions);
    const hasAllocations = summary.allocations.length > 0;
    totalEl.textContent = summary.total > 0 ? euro.format(summary.total) : "—";
    chartCenter.hidden = !hasAllocations;
    chartCanvas.setAttribute(
      "aria-label",
      hasAllocations
        ? `Portfolio allocation chart: ${summary.allocations.length} positions, total ${euro.format(summary.total)}`
        : "Portfolio allocation chart (no positions)",
    );

    listLoading.hidden = state.status !== "loading";
    listEmpty.hidden = state.status !== "ready" || state.positions.length > 0;
    chartEmpty.hidden = hasAllocations;
    legendEmpty.hidden = hasAllocations || state.status !== "ready";
    allocationMeta.textContent = hasAllocations
      ? `${summary.allocations.length} ${summary.allocations.length === 1 ? "position" : "positions"}`
      : "";
    exportPngButton.disabled = !hasAllocations || activeTab !== "portfolio";
    positionsMeta.textContent =
      state.status === "ready" && state.positions.length > 0
        ? `${state.positions.length} ${state.positions.length === 1 ? "position" : "positions"}`
        : "";
    exportJsonButton.disabled = state.positions.length === 0;
    listBody.replaceChildren(...summary.allocations.flatMap(renderRow));
    renderLegend(summary);

    for (const allocation of summary.allocations) {
      if (allocation.position.kind === "etf") funds.ensureFund(allocation.position.isin);
    }

    const fundsByIsin = resolvedFunds(state.positions);
    chart.update(summary);
    lookThroughView.render(state.positions, fundsByIsin);
  }

  function legendEntries(summary: PortfolioSummary): ExportRow[] {
    const colors = allocationColors(summary.allocations);
    return summary.allocations.map((allocation, index) => {
      const { position } = allocation;
      const isCash = position.kind === "cash";
      const info = isCash ? undefined : funds.getFundState(position.isin).info;
      return {
        label: isCash
          ? position.bank
            ? `Cash · ${position.bank}`
            : "Cash"
          : position.name || info?.name || position.isin,
        meta: legendMeta(position.kind, position.isin, position.interestRate, info),
        amount: allocation.amount,
        share: allocation.share,
        color: colors[index] ?? "",
      };
    });
  }

  function renderLegend(summary: PortfolioSummary): void {
    legendEl.replaceChildren(
      ...legendEntries(summary).map((entry) => {
        const dot = el("span", "legend-dot");
        dot.style.setProperty("--dot", entry.color);

        const label = el("div", "legend-label");
        label.append(document.createTextNode(entry.label));
        if (entry.meta) label.append(el("span", "legend-sub", entry.meta));

        const values = el("div", "legend-values");
        values.append(el("span", "legend-value", euro.format(entry.amount)));
        values.append(el("span", "legend-share", `${percent.format(entry.share * 100)}%`));

        const item = el("li", "legend-item");
        item.append(dot, label, values);
        return item;
      }),
    );
  }

  function renderRow(allocation: Allocation): HTMLTableRowElement[] {
    const { position, amount, share } = allocation;
    const isCash = position.kind === "cash";
    const fundState = isCash ? null : funds.getFundState(position.isin);
    const info = fundState?.info;
    const dataSource = isCash ? "" : position.source || info?.source || "";

    const row = document.createElement("tr");
    row.className = "position-row";

    const assetCell = document.createElement("td");
    assetCell.append(
      el("div", "asset-title", isCash ? "Cash" : position.name || info?.name || position.isin),
    );
    if (isCash) {
      if (position.bank) assetCell.append(el("div", "asset-sub", position.bank));
      if (typeof position.interestRate === "number") {
        assetCell.append(el("div", "asset-meta", `${percent.format(position.interestRate)}% p.a.`));
      }
    } else {
      assetCell.append(el("div", "asset-sub", position.isin));
      if (dataSource) {
        assetCell.append(el("div", "asset-source", `Source: ${sourceLabel(dataSource)}`));
      }
    }
    if (info) assetCell.append(renderChips(info));
    if (fundState?.status === "loading")
      assetCell.append(el("div", "asset-meta", "Resolving fund…"));
    if (fundState?.status === "error") {
      assetCell.append(
        el("div", "asset-meta asset-meta-error", fundState.error ?? "Fund data unavailable"),
      );
    }

    const valueCell = el("td", "num", euro.format(amount));
    const shareCell = el("td", "num", `${percent.format(share * 100)}%`);

    const actions = el("td", "actions");

    const edit = el("button", "edit", "✎") as HTMLButtonElement;
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.id = position.id;
    edit.title = "Edit position";
    edit.setAttribute("aria-label", "Edit position");
    actions.append(edit);

    if (!isCash) {
      const toggle = el(
        "button",
        "toggle",
        expanded.has(position.id) ? "▾" : "▸",
      ) as HTMLButtonElement;
      toggle.type = "button";
      toggle.dataset.action = "toggle";
      toggle.dataset.id = position.id;
      toggle.title = "Show fund details";
      toggle.setAttribute("aria-label", "Show fund details");
      actions.append(toggle);
    }
    const remove = el("button", "remove", "×") as HTMLButtonElement;
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.dataset.id = position.id;
    remove.title = "Remove position";
    remove.setAttribute("aria-label", "Remove position");
    actions.append(remove);

    row.append(assetCell, valueCell, shareCell, actions);

    if (!isCash && expanded.has(position.id)) {
      const details = document.createElement("tr");
      details.className = "details-row";
      const cell = el("td", "");
      cell.colSpan = 4;
      cell.append(renderDetails(fundState, amount));
      details.append(cell);
      return [row, details];
    }

    return [row];
  }

  function renderDetails(state: funds.FundState | null, positionValue: number): HTMLElement {
    const box = el("div", "fund-details");
    if (!state || state.status === "loading") {
      box.append(el("p", "asset-meta", "Loading fund data…"));
      return box;
    }
    if (state.status === "error" || !state.info) {
      box.append(el("p", "asset-meta asset-meta-error", state.error ?? "Fund data unavailable"));
      return box;
    }

    const info = state.info;
    const heading = el("div", "details-heading");
    heading.append(el("span", "details-title", info.name));
    if (info.stale) heading.append(el("span", "badge badge-warn", "cached / stale"));
    heading.append(el("span", "badge", sourceLabel(info.source)));
    box.append(heading);

    if (info.topHoldings.length === 0) {
      box.append(el("p", "asset-meta", "No holdings published for this fund."));
      return box;
    }

    const table = document.createElement("table");
    table.className = "holdings";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(el("th", "", "Holding"));
    headRow.append(el("th", "num", "Fund weight"));
    headRow.append(el("th", "num", "Exposure"));
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (const holding of info.topHoldings) {
      const tr = document.createElement("tr");
      tr.append(el("td", "", holding.name));
      tr.append(el("td", "num", `${percent.format(holding.weight)}%`));
      tr.append(el("td", "num", euro.format((holding.weight / 100) * positionValue)));
      body.append(tr);
    }
    table.append(body);
    box.append(table);

    const footer = el("p", "details-footer");
    const bits = [
      `${info.topHoldings.length} holdings cover ${percent.format(info.coverage * 100)}% of the fund`,
    ];
    if (info.dataAsOf) bits.push(`data as of ${info.dataAsOf}`);
    footer.textContent = bits.join(" · ");
    box.append(footer);

    return box;
  }

  function renderChips(info: FundInfo): HTMLElement {
    const chips = el("div", "chips");
    if (info.ter) chips.append(el("span", "chip", `TER ${info.ter}`));
    if (info.currency) chips.append(el("span", "chip", info.currency));
    if (typeof info.holdingsCount === "number") {
      chips.append(el("span", "chip", `${integer.format(info.holdingsCount)} holdings`));
    }
    return chips;
  }

  store.subscribe(render);
  funds.subscribeFunds(render);
  void store.init();
}

function describePosition(position: Position | undefined): string {
  if (!position) return "this position";
  if (position.kind === "cash") {
    return position.bank ? `the cash position at ${position.bank}` : "this cash position";
  }
  return `the position in ${position.name || position.isin}`;
}

/** Maps a provider's internal source name to its user-facing data source label. */
function sourceLabel(source: string): string {
  if (source === "FundSniffer") return "finanzen.net";
  if (source === "FundFacts") return "FundFact";
  return source;
}

function legendMeta(
  kind: AssetKind,
  isin: string,
  interestRate: number | undefined,
  info: FundInfo | undefined,
): string {
  if (kind === "cash") {
    return typeof interestRate === "number" ? `${percent.format(interestRate)}% p.a.` : "";
  }
  const parts: string[] = [];
  if (isin) parts.push(isin);
  if (info?.ter) parts.push(`TER ${info.ter}`);
  if (info?.currency) parts.push(info.currency);
  if (typeof info?.holdingsCount === "number") {
    parts.push(`${integer.format(info.holdingsCount)} holdings`);
  }
  return parts.join(" · ");
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function get<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
