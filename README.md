# ETF Viewer

Enter your ETF positions by ISIN and your cash (with bank and interest rate) and see how your
portfolio is allocated.

## Features

- doughnut chart of portfolio
- exposure to stocks, sectors and countries

## Getting started

Run

```bash
npm install
npm run dev
```

Without an API key the backend uses [FundFacts'](https://fundfactsapi.com/) keyless
demo endpoint. For higher limits, get a key and set the env `FUNDFACTS_API_KEY`.
