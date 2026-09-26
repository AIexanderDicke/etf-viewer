import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { HttpStatus } from "../shared/constants.ts";
import type { PortfolioRepo, PositionRepo } from "./db.ts";
import type { FundService } from "./holdings/service.ts";
import { fundsRouter } from "./routes/funds.ts";
import { portfoliosRouter } from "./routes/portfolios.ts";
import { positionsRouter } from "./routes/positions.ts";

export interface AppDeps {
  readonly portfolioRepo: PortfolioRepo;
  readonly positionRepo: PositionRepo;
  readonly fundService: FundService;
  readonly fundDataMode: string;
  /** Directory of the built frontend to serve; omit in dev so Vite serves it. */
  readonly staticDir?: string;
}

/** Extracts an HTTP status from a thrown value, defaulting to 500. */
function statusOf(error: unknown): number {
  if (typeof error === "object" && error !== null) {
    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    const value = status ?? statusCode;
    if (typeof value === "number" && value >= 400 && value < 600) return value;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = statusOf(error);
  if (status >= 500) console.error("[server] unhandled error:", error);
  res.status(status).json({
    error:
      status === HttpStatus.INTERNAL_SERVER_ERROR ? "internal server error" : "invalid request",
  });
}

/** Builds the Express app. Kept separate from `listen` so tests can mount it. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", fundDataMode: deps.fundDataMode });
  });

  app.use("/api/portfolios", portfoliosRouter(deps.portfolioRepo));
  app.use("/api/positions", positionsRouter(deps.positionRepo, deps.portfolioRepo));
  app.use("/api/funds", fundsRouter(deps.fundService));

  if (deps.staticDir) {
    const staticDir = deps.staticDir;
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((_req, res) => {
    res.status(HttpStatus.NOT_FOUND).json({ error: "not found" });
  });

  app.use(errorHandler);

  return app;
}
