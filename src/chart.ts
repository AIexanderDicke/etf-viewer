import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import type { FundInfo, PortfolioSummary } from "../shared/types.ts";
import { euro, integer, percent } from "./format.ts";

Chart.register(ArcElement, DoughnutController, Legend, Tooltip);

export const PALETTE = [
  "#4f7cff",
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
];

const CASH_COLOR = "#94a3b8";

export function paletteColors(count: number): string[] {
  return Array.from({ length: count }, (_, index) => PALETTE[index % PALETTE.length]);
}

/** Extra fund metadata shown when hovering a slice. */
export interface SliceDetails {
  name: string;
  isin?: string;
  ter?: string;
  currency?: string;
  holdingsCount?: number;
}

/**
 * A reusable doughnut chart. Slices are always shown as EUR value plus their
 * share of the total; when details are supplied they are shown in the tooltip
 * title (fund name, ISIN, TER, currency, holdings count).
 */
export function createDoughnut(canvas: HTMLCanvasElement, cutout = "55%", showLegend = true) {
  const details: SliceDetails[] = [];

  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: [] as string[],
      datasets: [
        {
          data: [] as number[],
          backgroundColor: [] as string[],
          borderColor: "#0f172a",
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      plugins: {
        legend: showLegend
          ? { position: "bottom", labels: { color: "#e2e8f0", boxWidth: 12, padding: 16 } }
          : { display: false },
        tooltip: {
          callbacks: {
            title(items) {
              const detail = details[items[0]?.dataIndex ?? -1];
              if (!detail) return items[0]?.label ?? "";
              const lines = [detail.name];
              if (detail.isin) lines.push(detail.isin);
              if (detail.ter) lines.push(`TER ${detail.ter}`);
              if (detail.currency) lines.push(detail.currency);
              if (typeof detail.holdingsCount === "number") {
                lines.push(`${integer.format(detail.holdingsCount)} holdings`);
              }
              return lines;
            },
            label(ctx) {
              const value = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + Number(b), 0);
              const share = total > 0 ? (value / total) * 100 : 0;
              return `${euro.format(value)} (${percent.format(share)}%)`;
            },
          },
        },
      },
    },
  });

  return {
    update(labels: string[], data: number[], colors?: string[], sliceDetails?: SliceDetails[]) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.data.datasets[0].backgroundColor = colors ?? paletteColors(data.length);
      details.length = 0;
      if (sliceDetails) details.push(...sliceDetails);
      chart.update();
    },
    resize() {
      chart.resize();
    },
    destroy() {
      chart.destroy();
    },
  };
}

export type Doughnut = ReturnType<typeof createDoughnut>;

export function createAllocationChart(canvas: HTMLCanvasElement) {
  const base = createDoughnut(canvas, "58%", false);

  return {
    update(summary: PortfolioSummary, fundsByIsin: Map<string, FundInfo>) {
      const labels = summary.allocations.map((allocation) =>
        allocation.position.kind === "cash"
          ? "Cash"
          : allocation.position.name || allocation.position.isin,
      );
      const data = summary.allocations.map((allocation) => allocation.amount);
      const colors = summary.allocations.map((allocation, index) =>
        allocation.position.kind === "cash" ? CASH_COLOR : PALETTE[index % PALETTE.length],
      );
      const details = summary.allocations.map<SliceDetails>((allocation) => {
        if (allocation.position.kind === "cash") return { name: "Cash" };
        const info = fundsByIsin.get(allocation.position.isin.toUpperCase());
        return {
          name: allocation.position.name || info?.name || allocation.position.isin,
          isin: allocation.position.isin,
          ter: info?.ter,
          currency: info?.currency,
          holdingsCount: info?.holdingsCount,
        };
      });
      base.update(labels, data, colors, details);
    },
    resize: () => base.resize(),
  };
}

export type AllocationChart = ReturnType<typeof createAllocationChart>;
