import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import type { ChartType, TooltipPositionerFunction } from "chart.js";
import type { Allocation, PortfolioSummary, Position } from "../shared/types.ts";
import { euro, percent } from "./format.ts";

Chart.register(ArcElement, DoughnutController, Legend, Tooltip);

declare module "chart.js" {
  interface TooltipPositionerMap {
    outside: TooltipPositionerFunction<ChartType>;
  }
}

/**
 * Anchors the tooltip just beyond the hovered slice's outer edge, so it never
 * lands on the doughnut's centre (where the allocation total is drawn).
 */
Tooltip.positioners.outside = function (items, eventPosition) {
  const arc = items[0]?.element as ArcElement | undefined;
  if (!arc) {
    return { x: eventPosition.x, y: eventPosition.y, xAlign: "center", yAlign: "center" };
  }
  const props = arc.getProps(["x", "y", "startAngle", "endAngle", "outerRadius"], true);
  const angle = (props.startAngle + props.endAngle) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius = props.outerRadius + 8;
  return {
    x: (props.x ?? 0) + cos * radius,
    y: (props.y ?? 0) + sin * radius,
    xAlign: cos >= 0 ? "left" : "right",
    yAlign: sin >= 0 ? "top" : "bottom",
  };
};

export const PALETTE = [
  "#5b5bd6",
  "#0d9488",
  "#8e4ec6",
  "#e5484d",
  "#f5a524",
  "#3e63dd",
  "#30a46c",
  "#d6409f",
  "#6e56cf",
  "#0091ff",
  "#e54666",
  "#f76b15",
];

const CASH_COLOR = "#9d9db0";

const CHART_FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

export function paletteColors(count: number): string[] {
  return Array.from({ length: count }, (_, index) => PALETTE[index % PALETTE.length]);
}

/** Slice colours for the portfolio allocation, keeping cash visually neutral. */
export function allocationColors(allocations: Allocation[]): string[] {
  return allocations.map((allocation, index) =>
    allocation.position.kind === "cash" ? CASH_COLOR : PALETTE[index % PALETTE.length],
  );
}

/**
 * A reusable doughnut chart. Slices show their EUR value plus share of total on
 * hover; fund metadata lives in the surrounding legend, not in the tooltip.
 */
export function createDoughnut(canvas: HTMLCanvasElement, cutout = "55%", showLegend = true) {
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: [] as string[],
      datasets: [
        {
          data: [] as number[],
          backgroundColor: [] as string[],
          borderWidth: 0,
          borderRadius: 6,
          spacing: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      plugins: {
        legend: showLegend
          ? {
              position: "bottom",
              labels: {
                color: "#41414f",
                boxWidth: 8,
                boxHeight: 8,
                usePointStyle: true,
                pointStyle: "rectRounded",
                padding: 14,
                font: { family: CHART_FONT, size: 12 },
              },
            }
          : { display: false },
        tooltip: {
          position: "outside",
          backgroundColor: "#ffffff",
          titleColor: "#17171f",
          bodyColor: "#41414f",
          borderColor: "#e7e7ef",
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
          displayColors: false,
          titleFont: { family: CHART_FONT, size: 12, weight: 600 },
          bodyFont: { family: CHART_FONT, size: 12 },
          callbacks: {
            label(ctx) {
              const value = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + Number(b), 0);
              const share = total > 0 ? (value / total) * 100 : 0;
              return `${euro.format(value)} · ${percent.format(share)}%`;
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
  const base = createDoughnut(canvas, "62%", false);

  return {
    update(summary: PortfolioSummary) {
      const labels = summary.allocations.map((allocation) =>
        allocation.position.kind === "cash"
          ? cashLabel(allocation.position)
          : allocation.position.name || allocation.position.isin,
      );
      const data = summary.allocations.map((allocation) => allocation.amount);
      base.update(labels, data, allocationColors(summary.allocations));
    },
    resize: () => base.resize(),
  };
}

export type AllocationChart = ReturnType<typeof createAllocationChart>;

function cashLabel(position: Position): string {
  return position.bank ? `Cash · ${position.bank}` : "Cash";
}
