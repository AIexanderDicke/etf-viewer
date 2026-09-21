import { Router } from "express";
import type { PortfolioRepo } from "../db.ts";

function readName(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const name = (body as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

export function portfoliosRouter(repo: PortfolioRepo): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(repo.list());
  });

  router.post("/", (req, res) => {
    res.status(201).json(repo.create(readName(req.body) ?? ""));
  });

  router.patch("/:id", (req, res) => {
    const existing = repo.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "portfolio not found" });
      return;
    }
    const name = readName(req.body);
    if (name === undefined) {
      res.status(400).json({ error: "name must be a string" });
      return;
    }
    res.json(repo.update(existing.id, { name }));
  });

  return router;
}
