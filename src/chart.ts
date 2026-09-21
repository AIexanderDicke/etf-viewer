import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import { euro, percent } from "./format.ts";
import type { PortfolioSummary } from "../shared/types.ts";

Chart.register(ArcElement, DoughnutController, Legend, Tooltip);

const PALETTE = [
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
];

const CASH_COLOR = "#94a3b8";

function colorFor(index: number, isCash: boolean): string {
  return isCash ? CASH_COLOR : PALETTE[index % PALETTE.length];
}

export function createAllocationChart(canvas: HTMLCanvasElement) {
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
      cutout: "55%",
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
    update(summary: PortfolioSummary) {
      const labels = summary.allocations.map((allocation) =>
        allocation.position.kind === "cash"
          ? "Cash"
          : allocation.position.name || allocation.position.isin,
      );
      const data = summary.allocations.map((allocation) => allocation.amount);
      const colors = summary.allocations.map((allocation, index) =>
        colorFor(index, allocation.position.kind === "cash"),
      );

      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.data.datasets[0].backgroundColor = colors;
      chart.update();
    },
  };
}

export type AllocationChart = ReturnType<typeof createAllocationChart>;
