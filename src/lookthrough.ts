import { computeLookThrough, hasTopicData } from "../shared/exposure.ts";
import type {
  BreakdownKind,
  ExposureRow,
  FundInfo,
  LookThrough,
  Position,
  TopicExposure,
  TopicRow,
} from "../shared/types.ts";
import { createDoughnut } from "./chart.ts";
import { euro, percent } from "./format.ts";

const TOPIC_LABELS: Record<BreakdownKind, string> = {
  sector: "Sector",
  geography: "Country",
};

const TOPIC_ORDER: BreakdownKind[] = ["sector", "geography"];

/** Below this portfolio share a stock is merged into "Other stocks". */
const STOCK_THRESHOLD = 0.005;
/** Doughnut slices beyond this are merged into "Other". */
const MAX_SLICES = 8;

const TEMPLATE = `
  <section class="card">
    <h2>Stock exposure</h2>
    <p class="coverage-note" id="lt-coverage"></p>
    <table class="positions exposure-table">
      <thead>
        <tr><th>Position</th><th class="num">Value</th><th class="num">Share</th></tr>
      </thead>
      <tbody id="lt-stocks"></tbody>
    </table>
    <p class="empty-hint" id="lt-empty" hidden>Add ETFs to see the look-through.</p>
  </section>

  <section class="card">
    <h2>Topic exposure</h2>
    <div class="topic-switch" id="lt-topic-switch"></div>
    <div class="chart-wrap"><canvas id="topic-chart"></canvas></div>
    <ul class="topic-list" id="lt-topic-list"></ul>
    <p class="empty-hint" id="lt-topic-empty" hidden>No sector / country data for these funds.</p>
  </section>
`;

interface DisplayRow {
  label: string;
  sub?: string;
  amount: number;
  share: number;
  synthetic?: boolean;
}

export function createLookThroughView(container: HTMLElement) {
  container.innerHTML = TEMPLATE;

  const chart = createDoughnut(get<HTMLCanvasElement>("topic-chart"), "60%");
  const coverageEl = get<HTMLParagraphElement>("lt-coverage");
  const stocksBody = get<HTMLTableSectionElement>("lt-stocks");
  const emptyEl = get<HTMLParagraphElement>("lt-empty");
  const switchEl = get<HTMLDivElement>("lt-topic-switch");
  const topicList = get<HTMLElement>("lt-topic-list");
  const topicEmpty = get<HTMLParagraphElement>("lt-topic-empty");

  let activeTopic: BreakdownKind = "sector";
  let latest: LookThrough | null = null;

  switchEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-topic]");
    if (!button) return;
    activeTopic = button.dataset.topic as BreakdownKind;
    if (latest) renderTopics(latest);
  });

  function render(positions: Position[], fundsByIsin: Map<string, FundInfo>): void {
    const lookThrough = computeLookThrough(positions, fundsByIsin);
    latest = lookThrough;

    const hasEtfs = positions.some((position) => position.kind === "etf");
    emptyEl.hidden = !(lookThrough.total === 0 || !hasEtfs);
    coverageEl.textContent = lookThrough.total > 0 ? coverageText(lookThrough) : "";

    renderStocks(lookThrough);
    renderTopics(lookThrough);
  }

  function renderStocks(lookThrough: LookThrough): void {
    stocksBody.replaceChildren(...displayRows(lookThrough).map(renderStockRow));
  }

  function renderTopics(lookThrough: LookThrough): void {
    const available = TOPIC_ORDER.filter((kind) => hasTopicData(lookThrough.topics[kind]));
    if (!available.includes(activeTopic)) activeTopic = available[0];

    switchEl.replaceChildren(
      ...available.map((kind) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `topic-tab${kind === activeTopic ? " is-active" : ""}`;
        button.dataset.topic = kind;
        button.textContent = TOPIC_LABELS[kind];
        return button;
      }),
    );

    if (available.length === 0) {
      topicEmpty.hidden = false;
      topicList.replaceChildren();
      chart.update([], []);
      return;
    }
    topicEmpty.hidden = true;

    const topic = lookThrough.topics[activeTopic];
    const rows = collapseRows(topic.rows, MAX_SLICES);
    chart.update(
      rows.map((row) => row.label),
      rows.map((row) => row.amount),
    );

    topicList.replaceChildren(...topic.rows.map((row) => renderTopicRow(row, topic)));
  }

  function displayRows(lookThrough: LookThrough): DisplayRow[] {
    const rows: DisplayRow[] = [];
    let restAmount = 0;

    for (const stock of lookThrough.stocks) {
      if (stock.share >= STOCK_THRESHOLD) rows.push(fromStock(stock));
      else restAmount += stock.amount;
    }
    if (restAmount > 0) {
      rows.push({
        label: "Other stocks",
        amount: restAmount,
        share: lookThrough.total > 0 ? restAmount / lookThrough.total : 0,
        synthetic: true,
      });
    }

    rows.push({
      label: "Cash",
      amount: lookThrough.cash.amount,
      share: lookThrough.cash.share,
      synthetic: true,
    });

    if (lookThrough.unclassified.amount > 0) {
      rows.push({
        label: "Other holdings",
        sub: "outside the funds' published top list",
        amount: lookThrough.unclassified.amount,
        share: lookThrough.unclassified.share,
        synthetic: true,
      });
    }

    if (lookThrough.unresolved.amount > 0) {
      rows.push({
        label: "Not resolved yet",
        sub: lookThrough.unresolved.isins.join(", "),
        amount: lookThrough.unresolved.amount,
        share: lookThrough.unresolved.share,
        synthetic: true,
      });
    }

    return rows;
  }

  function renderStockRow(row: DisplayRow): HTMLTableRowElement {
    const tr = document.createElement("tr");
    if (row.synthetic) tr.className = "synthetic-row";

    const asset = document.createElement("td");
    asset.append(el("div", "asset-title", row.label));
    if (row.sub) asset.append(el("div", "asset-sub", row.sub));
    if (row.label === "Cash") asset.append(el("div", "asset-sub", "portfolio cash"));

    tr.append(asset);
    tr.append(el("td", "num", euro.format(row.amount)));
    tr.append(el("td", "num", `${percent.format(row.share * 100)}%`));
    return tr;
  }

  function renderTopicRow(row: TopicRow, topic: TopicExposure): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "topic-row";

    const head = el("div", "topic-head");
    head.append(el("span", "topic-label", row.label));
    head.append(el("span", "topic-value", `${percent.format(row.share * 100)}%`));
    li.append(head);

    const bar = el("div", "bar");
    const fill = el("span", "");
    const basis = topic.basis > 0 ? topic.basis : 1;
    fill.style.width = `${Math.min(100, (row.amount / basis) * 100)}%`;
    bar.append(fill);
    li.append(bar);

    li.append(el("div", "topic-sub", euro.format(row.amount)));
    return li;
  }

  return {
    render,
    resize: () => chart.resize(),
  };
}

export type LookThroughView = ReturnType<typeof createLookThroughView>;

function coverageText(lookThrough: LookThrough): string {
  const bits: string[] = [];
  bits.push(
    `Top holdings explain ${percent.format(lookThrough.coverage * 100)}% of the invested ETF value`,
  );
  if (lookThrough.cash.share > 0)
    bits.push(`${percent.format(lookThrough.cash.share * 100)}% is cash`);
  if (lookThrough.unresolved.share > 0) {
    bits.push(`${percent.format(lookThrough.unresolved.share * 100)}% still resolving`);
  }
  return bits.join(" · ");
}

function fromStock(stock: ExposureRow): DisplayRow {
  return {
    label: stock.label,
    sub: stock.fundCount > 1 ? `held in ${stock.fundCount} funds` : undefined,
    amount: stock.amount,
    share: stock.share,
  };
}

function collapseRows(rows: TopicRow[], max: number): TopicRow[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  const otherAmount = tail.reduce((sum, row) => sum + row.amount, 0);
  const otherShare = tail.reduce((sum, row) => sum + row.share, 0);
  return [...head, { label: "Other", amount: otherAmount, share: otherShare }];
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
