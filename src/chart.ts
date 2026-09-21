import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import type { PortfolioSummary } from "../shared/types.ts";
import { euro, percent } from "./format.ts";

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

/**
 * A reusable doughnut chart whose slices are always shown as EUR value plus
 * their share of the total.
 */
export function createDoughnut(canvas: HTMLCanvasElement, cutout = "55%") {
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
        legend: {
          position: "bottom",
          labels: { color: "#e2e8f0", boxWidth: 12, padding: 16 },
        },
        tooltip: {
          callbacks: {
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
    update(labels: string[], data: number[], colors?: string[]) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.data.datasets[0].backgroundColor = colors ?? paletteColors(data.length);
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
  const base = createDoughnut(canvas);

  return {
    update(summary: PortfolioSummary) {
      const labels = summary.allocations.map((allocation) =>
        allocation.position.kind === "cash"
          ? "Cash"
          : allocation.position.name || allocation.position.isin,
      );
      const data = summary.allocations.map((allocation) => allocation.amount);
      const colors = summary.allocations.map((allocation, index) =>
        allocation.position.kind === "cash" ? CASH_COLOR : PALETTE[index % PALETTE.length],
      );
      base.update(labels, data, colors);
    },
    resize: () => base.resize(),
  };
}

export type AllocationChart = ReturnType<typeof createAllocationChart>;
