import { Router } from "express";
import { isValidIsin, normalizeIsin } from "../../shared/isin.ts";
import type { FundService } from "../holdings/service.ts";

export function fundsRouter(service: FundService): Router {
  const router = Router();

  router.get("/:isin", async (req, res) => {
    const isin = normalizeIsin(req.params.isin ?? "");
    if (!isValidIsin(isin)) {
      res.status(400).json({ error: "invalid ISIN" });
      return;
    }

    const info = await service.getFund(isin);
    if (!info) {
      res.status(404).json({ error: `no fund data for ${isin}` });
      return;
    }
    res.json(info);
  });

  return router;
}
