import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { PositionRepo } from "./db.ts";
import type { FundService } from "./holdings/service.ts";
import { fundsRouter } from "./routes/funds.ts";
import { positionsRouter } from "./routes/positions.ts";

export interface AppDeps {
  readonly positionRepo: PositionRepo;
  readonly fundService: FundService;
  readonly fundDataMode: string;
}

/** Extracts an HTTP status from a thrown value, defaulting to 500. */
function statusOf(error: unknown): number {
  if (typeof error === "object" && error !== null) {
    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    const value = status ?? statusCode;
    if (typeof value === "number" && value >= 400 && value < 600) return value;
  }
  return 500;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = statusOf(error);
  if (status >= 500) console.error("[server] unhandled error:", error);
  res.status(status).json({ error: status === 500 ? "internal server error" : "invalid request" });
}

/** Builds the Express app. Kept separate from `listen` so tests can mount it. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", fundDataMode: deps.fundDataMode });
  });

  app.use("/api/positions", positionsRouter(deps.positionRepo));
  app.use("/api/funds", fundsRouter(deps.fundService));

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  app.use(errorHandler);

  return app;
}
