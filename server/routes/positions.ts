import { Router } from "express";
import { isValidIsin, normalizeIsin } from "../../shared/isin.ts";
import type { AssetKind, PositionInput } from "../../shared/types.ts";
import type { PortfolioRepo, PositionRepo } from "../db.ts";

interface ValidInput {
  kind: AssetKind;
  isin: string;
  name: string;
  bank: string;
  interestRate?: number;
  amount: number;
}

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
    return { value: { kind, isin, name, bank: "", amount } };
  }

  const bank = typeof input.bank === "string" ? input.bank.trim() : "";
  const rawRate = (input as { interestRate?: unknown }).interestRate;
  let interestRate: number | undefined;
  if (rawRate !== undefined && rawRate !== null && rawRate !== "") {
    const parsed = Number(rawRate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "interestRate must be a non-negative number" };
    }
    interestRate = parsed;
  }
  return { value: { kind, isin: "", name: "", bank, interestRate, amount } };
}

function readPortfolioId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const id = (body as { portfolioId?: unknown }).portfolioId;
  return typeof id === "string" && id ? id : undefined;
}

export function positionsRouter(repo: PositionRepo, portfolios: PortfolioRepo): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const portfolioId =
      typeof req.query.portfolioId === "string" && req.query.portfolioId
        ? req.query.portfolioId
        : undefined;
    res.json(repo.list(portfolioId));
  });

  router.post("/", (req, res) => {
    const parsed = parseInput(req.body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const portfolioId = readPortfolioId(req.body) ?? portfolios.default().id;
    if (!portfolios.get(portfolioId)) {
      res.status(400).json({ error: "unknown portfolio" });
      return;
    }

    const value = parsed.value!;
    // A fund added twice is joined into a single position: the same ISIN
    // inside one portfolio is always one row with a summed amount.
    if (value.kind === "etf") {
      const existing = repo.findByIsin(portfolioId, value.isin);
      if (existing) {
        res.status(200).json(
          repo.update(existing.id, {
            amount: existing.amount + value.amount,
            name: existing.name || value.name,
          }),
        );
        return;
      }
    }

    res.status(201).json(repo.create(value, portfolioId));
  });

  router.patch("/:id", (req, res) => {
    const existing = repo.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "position not found" });
      return;
    }

    const body = (
      typeof req.body === "object" && req.body !== null ? req.body : {}
    ) as Partial<PositionInput>;
    const merged: Partial<PositionInput> = {
      kind: (body.kind ?? existing.kind) as AssetKind,
      isin: body.isin ?? existing.isin,
      name: body.name ?? existing.name,
      bank: body.bank ?? existing.bank,
      // An explicit key (even null/undefined) clears the rate; only an absent
      // key falls back to the stored value.
      interestRate: "interestRate" in body ? body.interestRate : existing.interestRate,
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
