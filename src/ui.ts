import type { Allocation, AssetKind, FundInfo } from "../shared/types.ts";
import { isValidIsin, summarize } from "./calc.ts";
import { createAllocationChart } from "./chart.ts";
import { euro, integer, percent } from "./format.ts";
import * as funds from "./funds.ts";
import { createLookThroughView } from "./lookthrough.ts";
import * as store from "./store.ts";

type TabId = "portfolio" | "lookthrough";

const TEMPLATE = `
  <header class="app-header">
    <div>
      <h1>ETF Viewer</h1>
      <p class="subtitle">Enter your ETF positions by ISIN and see how your portfolio is allocated.</p>
    </div>
    <div class="total">
      <span class="total-label">Total</span>
      <span class="total-value" id="total">—</span>
    </div>
  </header>

  <p class="status" id="app-status" role="alert" hidden></p>

  <nav class="tabs" id="tabs">
    <button type="button" class="tab is-active" data-tab="portfolio">Portfolio</button>
    <button type="button" class="tab" data-tab="lookthrough">Look-through</button>
  </nav>

  <section class="layout" id="view-portfolio">
    <section class="card chart-card">
      <h2>Allocation</h2>
      <div class="chart-wrap"><canvas id="allocation-chart"></canvas></div>
      <p class="empty-hint" id="chart-empty">Add a position to see the allocation.</p>
    </section>

    <section class="card">
      <h2>Positions</h2>
      <form id="position-form" class="position-form" novalidate>
        <div class="field">
          <label for="kind">Type</label>
          <select id="kind">
            <option value="etf">ETF</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div class="field field-isin">
          <label for="isin">ISIN</label>
          <input id="isin" type="text" placeholder="IE00B4L5Y983" autocomplete="off" spellcheck="false" />
        </div>
        <div class="field field-name">
          <label for="name">Name <span class="optional">(optional)</span></label>
          <input id="name" type="text" placeholder="MSCI World" autocomplete="off" />
        </div>
        <div class="field">
          <label for="amount">Value (EUR)</label>
          <input id="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="1000" />
        </div>
        <button type="submit" class="primary" id="submit-button">Add position</button>
        <p class="form-error" id="form-error" role="alert"></p>
      </form>

      <table class="positions">
        <thead>
          <tr><th>Asset</th><th class="num">Value</th><th class="num">Share</th><th></th></tr>
        </thead>
        <tbody id="position-list"></tbody>
      </table>
      <p class="empty-hint" id="list-empty" hidden>No positions yet.</p>
      <p class="empty-hint" id="list-loading">Loading positions…</p>
    </section>
  </section>

  <section class="layout" id="view-lookthrough" hidden></section>
`;

const expanded = new Set<string>();

export function mountApp(root: HTMLElement): void {
  root.innerHTML = TEMPLATE;

  const chart = createAllocationChart(get<HTMLCanvasElement>("allocation-chart"));
  const lookThroughView = createLookThroughView(get<HTMLElement>("view-lookthrough"));
  const viewPortfolio = get<HTMLElement>("view-portfolio");
  const viewLookThrough = get<HTMLElement>("view-lookthrough");

  const form = get<HTMLFormElement>("position-form");
  const kindInput = get<HTMLSelectElement>("kind");
  const isinInput = get<HTMLInputElement>("isin");
  const nameInput = get<HTMLInputElement>("name");
  const amountInput = get<HTMLInputElement>("amount");
  const submitButton = get<HTMLButtonElement>("submit-button");
  const errorEl = get<HTMLParagraphElement>("form-error");
  const totalEl = get<HTMLSpanElement>("total");
  const listBody = get<HTMLTableSectionElement>("position-list");
  const listEmpty = get<HTMLParagraphElement>("list-empty");
  const listLoading = get<HTMLParagraphElement>("list-loading");
  const chartEmpty = get<HTMLParagraphElement>("chart-empty");
  const statusEl = get<HTMLParagraphElement>("app-status");
  const tabsEl = get<HTMLElement>("tabs");

  const isinField = document.querySelector<HTMLDivElement>(".field-isin")!;
  const nameField = document.querySelector<HTMLDivElement>(".field-name")!;

  tabsEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-tab]");
    if (button) setTab(button.dataset.tab as TabId);
  });

  function setTab(tab: TabId): void {
    for (const button of tabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]")) {
      button.classList.toggle("is-active", button.dataset.tab === tab);
    }
    viewPortfolio.hidden = tab !== "portfolio";
    viewLookThrough.hidden = tab !== "lookthrough";
    render();
    if (tab === "lookthrough") lookThroughView.resize();
    else chart.resize();
  }

  kindInput.addEventListener("change", () => {
    const isCash = kindInput.value === "cash";
    isinField.hidden = isCash;
    nameField.hidden = isCash;
    if (isCash) {
      isinInput.value = "";
      nameInput.value = "";
    }
  });

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

    submitButton.disabled = true;
    try {
      await store.addPosition({
        kind,
        isin: kind === "etf" ? isin : "",
        name: nameInput.value.trim(),
        amount,
      });
      form.reset();
      kindInput.value = "etf";
      isinField.hidden = false;
      nameField.hidden = false;
      amountInput.focus();
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

    if (button.dataset.action === "remove") {
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

    if (state.status === "error") {
      statusEl.hidden = false;
      statusEl.textContent = `Backend error: ${state.error ?? "unknown"}. Is the API server running?`;
    } else {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }

    const summary = summarize(state.positions);
    totalEl.textContent = summary.total > 0 ? euro.format(summary.total) : "—";

    listLoading.hidden = state.status !== "loading";
    listEmpty.hidden = state.status !== "ready" || state.positions.length > 0;
    chartEmpty.hidden = summary.allocations.length > 0;
    listBody.replaceChildren(...summary.allocations.flatMap(renderRow));

    for (const allocation of summary.allocations) {
      if (allocation.position.kind === "etf") funds.ensureFund(allocation.position.isin);
    }

    chart.update(summary);
    lookThroughView.render(state.positions, resolvedFunds(state.positions));
  }

  function renderRow(allocation: Allocation): HTMLTableRowElement[] {
    const { position, amount, share } = allocation;
    const isCash = position.kind === "cash";
    const fundState = isCash ? null : funds.getFundState(position.isin);
    const info = fundState?.info;

    const row = document.createElement("tr");
    row.className = "position-row";

    const assetCell = document.createElement("td");
    assetCell.append(
      el("div", "asset-title", isCash ? "Cash" : position.name || info?.name || position.isin),
    );
    if (!isCash) assetCell.append(el("div", "asset-sub", position.isin));
    if (info) assetCell.append(renderChips(info));
    if (fundState?.status === "loading") assetCell.append(el("div", "asset-meta", "Resolving fund…"));
    if (fundState?.status === "error") {
      assetCell.append(
        el("div", "asset-meta asset-meta-error", fundState.error ?? "Fund data unavailable"),
      );
    }

    const valueCell = el("td", "num", euro.format(amount));
    const shareCell = el("td", "num", `${percent.format(share * 100)}%`);

    const actions = el("td", "actions");
    if (!isCash) {
      const toggle = el("button", "toggle", expanded.has(position.id) ? "▾" : "▸") as HTMLButtonElement;
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
    heading.append(el("span", "badge", info.source));
    box.append(heading);

    if (info.topHoldings.length === 0) {
      box.append(el("p", "asset-meta", "No holdings published for this fund."));
      return box;
    }

    const table = document.createElement("table");
    table.className = "holdings";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(el("th", "", "Top holding"));
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
      `Top ${info.topHoldings.length} cover ${percent.format(info.coverage * 100)}% of the fund`,
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
