import { Router } from "express";
import { isValidIsin, normalizeIsin } from "../../shared/isin.ts";
import type { AssetKind, PositionInput } from "../../shared/types.ts";
import type { PositionRepo } from "../db.ts";

type ValidInput = Required<PositionInput>;

interface ParseResult {
  value?: ValidInput;
  error?: string;
}

function parseInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) return { error: "Body must be an object" };
  const input = body as Partial<PositionInput>;

  const kind = input.kind;
  if (kind !== "etf" && kind !== "cash") return { error: "kind must be 'etf' or 'cash'" };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "amount must be > 0" };

  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (kind === "etf") {
    const isin = normalizeIsin(typeof input.isin === "string" ? input.isin : "");
    if (!isValidIsin(isin)) return { error: "invalid ISIN" };
    return { value: { kind, isin, name, amount } };
  }

  return { value: { kind, isin: "", name, amount } };
}

export function positionsRouter(repo: PositionRepo): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(repo.list());
  });

  router.post("/", (req, res) => {
    const parsed = parseInput(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.status(201).json(repo.create(parsed.value!));
  });

  router.patch("/:id", (req, res) => {
    const existing = repo.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "position not found" });
      return;
    }

    const body = (typeof req.body === "object" && req.body !== null
      ? req.body
      : {}) as Partial<PositionInput>;
    const merged: Partial<PositionInput> = {
      kind: (body.kind ?? existing.kind) as AssetKind,
      isin: body.isin ?? existing.isin,
      name: body.name ?? existing.name,
      amount: body.amount ?? existing.amount,
    };

    const parsed = parseInput(merged);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(repo.update(existing.id, parsed.value!));
  });

  router.delete("/:id", (req, res) => {
    if (!repo.remove(req.params.id)) {
      res.status(404).json({ error: "position not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
