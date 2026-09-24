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
- Fund data from **FundSniffer** (finanzen.net, the local port-8484 backend) by default, with
  **FundFacts** as a fallback — set `FUND_DATA_PROVIDER=fundfacts` (or `FUNDSNIFFER_BASE_URL`) to
  switch; the other source stays in the chain as a fallback.

## Getting started

Build the image and run it with a named volume for the SQLite database:

```bash
docker build -t etf-viewer .
docker run --rm -p 3000:3000 -v etf-viewer-data:/data etf-viewer
```

Open http://localhost:3000 and add positions on the **Positions** tab. The database lives in the
`etf-viewer-data` volume, so it survives container restarts.
