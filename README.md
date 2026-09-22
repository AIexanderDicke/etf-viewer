# ETF Viewer

Enter your ETF positions by ISIN plus your cash (value, bank and optional interest rate) and see
how the portfolio is allocated, what it actually holds, and how exposed you are to individual
stocks, sectors and countries.

## Features

- Doughnut chart of the portfolio allocation (ETF / cash).
- Fund metadata and top holdings per ISIN, with stale-cache and coverage badges.
- Look-through exposure: individual stocks aggregated across all ETFs, plus sector / country
  topic charts.
- Cash positions with a bank and optional interest rate.
- Multiple named portfolios: name the current one and start a new one, then switch between them
  from the picker in the header. Adding the same ISIN twice joins it into one position.
- Positions persisted server-side in SQLite; the browser only talks to same-origin `/api`.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the backend and the Vite dev server together. Open the URL Vite prints and
add positions on the **Positions** tab.

Without an API key the backend uses [FundFacts'](https://fundfactsapi.com/) keyless demo
endpoint. For higher limits, get a key and set `FUNDFACTS_API_KEY`.

To delete all portfolios, positions and cached funds, stop the backend and run `npm run db:clear`.
Use `npm run db:clear -- --cache` to drop only the cached fund data.
