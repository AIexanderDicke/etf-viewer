import { isValidIsin, summarize } from "./calc.ts";
import { createAllocationChart } from "./chart.ts";
import { euro, percent } from "./format.ts";
import * as store from "./store.ts";
import type { Allocation, AssetKind, PortfolioSummary } from "./types.ts";

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

  <main class="layout">
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
        <button type="submit" class="primary">Add position</button>
        <p class="form-error" id="form-error" role="alert"></p>
      </form>

      <table class="positions">
        <thead>
          <tr><th>Asset</th><th class="num">Value</th><th class="num">Share</th><th></th></tr>
        </thead>
        <tbody id="position-list"></tbody>
      </table>
      <p class="empty-hint" id="list-empty">No positions yet.</p>
    </section>
  </main>
`;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = TEMPLATE;

  const chart = createAllocationChart(get<HTMLCanvasElement>("allocation-chart"));
  const form = get<HTMLFormElement>("position-form");
  const kindInput = get<HTMLSelectElement>("kind");
  const isinInput = get<HTMLInputElement>("isin");
  const nameInput = get<HTMLInputElement>("name");
  const amountInput = get<HTMLInputElement>("amount");
  const errorEl = get<HTMLParagraphElement>("form-error");
  const totalEl = get<HTMLSpanElement>("total");
  const listBody = get<HTMLTableSectionElement>("position-list");
  const listEmpty = get<HTMLParagraphElement>("list-empty");
  const chartEmpty = get<HTMLParagraphElement>("chart-empty");

  const nameField = document.querySelector<HTMLDivElement>(".field-name")!;
  const isinField = document.querySelector<HTMLDivElement>(".field-isin")!;

  kindInput.addEventListener("change", () => {
    const isCash = kindInput.value === "cash";
    isinField.hidden = isCash;
    nameField.hidden = isCash;
    if (isCash) {
      isinInput.value = "";
      nameInput.value = "";
    }
  });

  form.addEventListener("submit", (event) => {
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

    store.addPosition({ kind, isin: kind === "etf" ? isin : "", name: nameInput.value.trim(), amount });

    form.reset();
    kindInput.value = "etf";
    isinField.hidden = false;
    nameField.hidden = false;
    amountInput.focus();
  });

  listBody.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
    if (button) store.removePosition(button.dataset.id!);
  });

  store.subscribe((positions) => {
    const summary = summarize(positions);
    totalEl.textContent = summary.total > 0 ? euro.format(summary.total) : "—";

    renderList(listBody, summary);
    listEmpty.hidden = positions.length > 0;
    chartEmpty.hidden = summary.allocations.length > 0;
    chart.update(summary);
  });
}

function renderList(tbody: HTMLTableSectionElement, summary: PortfolioSummary): void {
  tbody.replaceChildren(...summary.allocations.map(renderRow));
}

function renderRow({ position, amount, share }: Allocation) {
  const isCash = position.kind === "cash";

  const row = document.createElement("tr");

  const assetCell = document.createElement("td");
  const title = document.createElement("div");
  title.className = "asset-title";
  title.textContent = isCash ? "Cash" : position.name || position.isin;
  assetCell.append(title);
  if (!isCash && position.name) {
    const sub = document.createElement("div");
    sub.className = "asset-sub";
    sub.textContent = position.isin;
    assetCell.append(sub);
  }

  const valueCell = document.createElement("td");
  valueCell.className = "num";
  valueCell.textContent = euro.format(amount);

  const shareCell = document.createElement("td");
  shareCell.className = "num";
  shareCell.textContent = `${percent.format(share * 100)}%`;

  const actionCell = document.createElement("td");
  actionCell.className = "actions";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.dataset.id = position.id;
  remove.title = "Remove position";
  remove.setAttribute("aria-label", `Remove ${title.textContent}`);
  remove.textContent = "×";
  actionCell.append(remove);

  row.append(assetCell, valueCell, shareCell, actionCell);
  return row;
}

function get<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
