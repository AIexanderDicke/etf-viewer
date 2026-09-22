import { euro, percent } from "./format.ts";

export interface ExportRow {
  label: string;
  meta: string;
  amount: number;
  share: number;
  color: string;
}

export interface ExportData {
  title: string;
  total: string;
  chart: HTMLCanvasElement;
  rows: ExportRow[];
}

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const TEXT = "#17171f";
const MUTED = "#74748a";
const BORDER = "#e7e7ef";
const SURFACE = "#ffffff";

const WIDTH = 900;
const PADDING = 48;
const SCALE = 2;
const CHART_SIZE = 340;
const GAP = 32;
const HEADER_H = 34;
const ROW_H = 34;
const ROW_H_META = 52;
const VALUE_COL = 150;
const DOT = 9;

/** A filesystem-friendly `<portfolio>-allocation.png` name. */
export function exportFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "portfolio"}-allocation.png`;
}

/** Renders the doughnut plus the allocation table into a tall PNG card. */
export function exportPortfolioPng(data: ExportData): void {
  const tableHeight = HEADER_H + data.rows.reduce((sum, row) => sum + rowHeight(row), 0);
  const chartY = PADDING + 64;
  const tableY = chartY + CHART_SIZE + GAP;
  const height = tableY + tableHeight + PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "top";

  ctx.fillStyle = TEXT;
  ctx.font = `650 22px ${FONT_STACK}`;
  ctx.fillText(data.title, PADDING, PADDING);

  ctx.fillStyle = MUTED;
  ctx.font = `400 13px ${FONT_STACK}`;
  ctx.fillText(`Total ${data.total}`, PADDING, PADDING + 34);

  const chartX = (WIDTH - CHART_SIZE) / 2;
  ctx.drawImage(data.chart, chartX, chartY, CHART_SIZE, CHART_SIZE);

  const centerY = chartY + CHART_SIZE / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `600 11px ${FONT_STACK}`;
  ctx.fillText("TOTAL", WIDTH / 2, centerY - 18);
  ctx.fillStyle = TEXT;
  ctx.font = `650 26px ${FONT_STACK}`;
  ctx.fillText(data.total, WIDTH / 2, centerY + 2);
  ctx.textAlign = "left";

  drawTable(ctx, data.rows, tableY);

  triggerPngDownload(canvas, exportFilename(data.title));
}

function rowHeight(row: ExportRow): number {
  return row.meta ? ROW_H_META : ROW_H;
}

function drawTable(ctx: CanvasRenderingContext2D, rows: ExportRow[], startY: number): void {
  const left = PADDING;
  const right = WIDTH - PADDING;
  let y = startY;

  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = `600 11px ${FONT_STACK}`;
  ctx.fillText("ASSET", left + DOT + 12, y);
  ctx.textAlign = "right";
  ctx.fillText("VALUE", right - VALUE_COL, y);
  ctx.fillText("SHARE", right, y);
  y += HEADER_H - 14;
  rule(ctx, left, y, right);
  y += 14;

  for (const row of rows) {
    const top = y;
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.roundRect(left, top + 4, DOT, DOT, 2);
    ctx.fill();

    const labelWidth = right - VALUE_COL - 16 - (left + DOT + 12);
    ctx.textAlign = "left";
    ctx.fillStyle = TEXT;
    ctx.font = `550 14px ${FONT_STACK}`;
    ctx.fillText(truncate(ctx, row.label, labelWidth), left + DOT + 12, top);
    if (row.meta) {
      ctx.fillStyle = MUTED;
      ctx.font = `400 11px ${FONT_STACK}`;
      ctx.fillText(truncate(ctx, row.meta, labelWidth), left + DOT + 12, top + 20);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = `550 14px ${FONT_STACK}`;
    ctx.fillText(euro.format(row.amount), right - VALUE_COL, top);
    ctx.fillStyle = MUTED;
    ctx.font = `400 12px ${FONT_STACK}`;
    ctx.fillText(`${percent.format(row.share * 100)}%`, right, top);

    y = top + rowHeight(row) - 10;
    rule(ctx, left, y, right);
    y += 10;
  }
}

function rule(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

/** Truncates with an ellipsis so a long label never spills into the value column. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function triggerPngDownload(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, "image/png");
}
