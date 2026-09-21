# ETF Viewer

Enter your ETF positions by **ISIN** (plus your **cash**) and see how your
portfolio is allocated as a pie chart.

## Status

**Iteration 1 (ETF + cash allocation) is implemented.** Later iterations —
holdings ingestion and a stock-level look-through view — are specified in the
roadmap but not built yet.

- Reasoning and UI decisions: [docs/iteration-01.md](./docs/iteration-01.md)
- Full plan: [docs/roadmap.md](./docs/roadmap.md)
- Holdings-data research: [docs/data-sources.md](./docs/data-sources.md)

## Features (iteration 1)

- Add an ETF: ISIN + optional name + value in EUR.
- Add (multiple) cash positions.
- Doughnut chart of the allocation with value + percentage on hover.
- Table with each position's value and share of the total.
- Total portfolio value; remove positions.
- Data is stored locally in your browser (`localStorage`).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript only
```

## Tech stack

Vite + TypeScript (strict) + Chart.js. Vanilla DOM, no UI framework, no backend.

## Project layout

```
src/
  main.ts     bootstrap
  ui.ts       DOM, form, table
  store.ts    state + localStorage
  calc.ts     validation + allocation math (pure)
  chart.ts    Chart.js doughnut
  format.ts   EUR / % formatters
  types.ts    shared types
docs/
  iteration-01.md
  roadmap.md
  data-sources.md
```
