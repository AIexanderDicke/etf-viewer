import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.ts";
import { createFundCacheRepo, createPositionRepo, getDb } from "./db.ts";
import { createFundFactsProvider } from "./holdings/fundfacts.ts";
import { FundService } from "./holdings/service.ts";
import { createSnapshotProvider } from "./holdings/snapshot.ts";
import { fundsRouter } from "./routes/funds.ts";
import { positionsRouter } from "./routes/positions.ts";

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

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", fundDataMode: config.fundFactsApiKey ? "api-key" : "demo" });
});

app.use("/api/positions", positionsRouter(createPositionRepo(db)));
app.use("/api/funds", fundsRouter(fundService));

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] unhandled error:", error);
  res.status(500).json({ error: "internal server error" });
});

app.listen(config.port, () => {
  const mode = config.fundFactsApiKey ? "FundFacts API key" : "FundFacts keyless demo";
  console.log(`[server] listening on http://localhost:${config.port} (${mode})`);
  console.log(`[server] database: ${config.dbFile}`);
});
