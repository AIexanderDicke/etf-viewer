import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Position } from "../shared/types.ts";
import { api } from "./api.ts";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const position: Position = {
  id: "p1",
  portfolioId: "portfolio-1",
  kind: "cash",
  isin: "",
  name: "",
  bank: "",
  amount: 100,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("api client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists positions, optionally scoped to a portfolio", async () => {
    fetchMock.mockImplementation(() => jsonResponse([position]));

    await expect(api.listPositions()).resolves.toEqual([position]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );

    await api.listPositions("portfolio-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions?portfolioId=portfolio-1",
      expect.anything(),
    );
  });

  it("lists, creates and renames portfolios", async () => {
    const portfolio = {
      id: "portfolio-1",
      name: "Retirement",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    fetchMock.mockImplementation(() => jsonResponse([portfolio]));

    await expect(api.listPortfolios()).resolves.toEqual([portfolio]);
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolios", expect.anything());

    await api.createPortfolio("Retirement");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolios",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Retirement" }) }),
    );

    await api.renamePortfolio("portfolio-1", "Pension");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolios/portfolio-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Pension" }) }),
    );
  });

  it("sends create and update payloads", async () => {
    fetchMock.mockImplementation(() => jsonResponse(position));

    await api.addPosition({ kind: "cash", amount: 100 }, "portfolio-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "cash", amount: 100, portfolioId: "portfolio-1" }),
      }),
    );

    await api.updatePosition("p1", { amount: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions/p1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ amount: 200 }) }),
    );
  });

  it("encodes the ISIN in the fund request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ isin: "IE00B4L5Y983" }));

    await api.getFund("IE00B4L5Y983");
    expect(fetchMock).toHaveBeenCalledWith("/api/funds/IE00B4L5Y983", expect.anything());
  });

  it("resolves undefined for a 204 response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.removePosition("p1")).resolves.toBeUndefined();
  });

  it("surfaces the server's error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "amount must be > 0" }, 400));

    await expect(api.addPosition({ kind: "cash", amount: 0 }, "portfolio-1")).rejects.toThrow(
      "amount must be > 0",
    );
  });

  it("falls back to the status when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 500 }));

    await expect(api.listPositions()).rejects.toThrow("Request failed (500)");
  });

  it("falls back to the status when the error body has no message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));

    await expect(api.listPositions()).rejects.toThrow("Request failed (502)");
  });

  it("propagates network failures", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(api.listPositions()).rejects.toThrow("offline");
  });
});
