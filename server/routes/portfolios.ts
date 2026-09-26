import { Router } from "express";
import { HttpStatus } from "../../shared/constants.ts";
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
    const name = readName(req.body) ?? "";
    if (name.trim() && repo.findByName(name)) {
      res.status(HttpStatus.CONFLICT).json({ error: "portfolio name already in use" });
      return;
    }
    res.status(HttpStatus.CREATED).json(repo.create(name));
  });

  router.patch("/:id", (req, res) => {
    const existing = repo.get(req.params.id);
    if (!existing) {
      res.status(HttpStatus.NOT_FOUND).json({ error: "portfolio not found" });
      return;
    }
    const name = readName(req.body);
    if (name === undefined) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: "name must be a string" });
      return;
    }
    if (name.trim() && repo.findByName(name, existing.id)) {
      res.status(HttpStatus.CONFLICT).json({ error: "portfolio name already in use" });
      return;
    }
    res.json(repo.update(existing.id, { name }));
  });

  return router;
}
