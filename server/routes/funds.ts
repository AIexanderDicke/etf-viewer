import { Router } from "express";
import { HttpStatus } from "../../shared/constants.ts";
import { isValidIsin, normalizeIsin } from "../../shared/isin.ts";
import type { FundService } from "../holdings/service.ts";

export function fundsRouter(service: FundService): Router {
  const router = Router();

  router.get("/:isin", async (req, res) => {
    const isin = normalizeIsin(req.params.isin ?? "");
    if (!isValidIsin(isin)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: "invalid ISIN" });
      return;
    }

    const info = await service.getFund(isin);
    if (!info) {
      res.status(HttpStatus.NOT_FOUND).json({ error: `no fund data for ${isin}` });
      return;
    }
    res.json(info);
  });

  return router;
}
