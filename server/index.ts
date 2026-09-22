import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { createFundCacheRepo, createPortfolioRepo, createPositionRepo, getDb } from "./db.ts";
import { createFundFactsProvider } from "./holdings/fundfacts.ts";
import { FundService } from "./holdings/service.ts";
import { createSnapshotProvider } from "./holdings/snapshot.ts";

const db = getDb();

const providers = [createFundFactsProvider()];
if (config.enableSnapshotFallback) providers.push(createSnapshotProvider());

const fundService = new FundService({
  providers,
  cache: createFundCacheRepo(db),
  onError: (provider, isin, error) => {
    console.warn(`[funds] provider "${provider}" failed for ${isin}:`, error);
  },
});

const fundDataMode = config.fundFactsApiKey ? "api-key" : "demo";

const staticDir = path.resolve("dist");
const hasStaticFrontend = fs.existsSync(path.join(staticDir, "index.html"));

const app = createApp({
  portfolioRepo: createPortfolioRepo(db),
  positionRepo: createPositionRepo(db),
  fundService,
  fundDataMode,
  ...(hasStaticFrontend ? { staticDir } : {}),
});

const server = app.listen(config.port, () => {
  const mode = config.fundFactsApiKey ? "FundFacts API key" : "FundFacts keyless demo";
  console.log(`[server] listening on http://localhost:${config.port} (${mode})`);
  console.log(`[server] database: ${config.dbFile}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
