import type { Portfolio, Position, PositionInput } from "../shared/types.ts";
import { api, type PositionPatch } from "./api.ts";

export interface StoreState {
  status: "loading" | "ready" | "error";
  error?: string;
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  positions: Position[];
}

type Listener = (state: StoreState) => void;

const ACTIVE_KEY = "etf-viewer:active-portfolio";

let state: StoreState = {
  status: "loading",
  portfolios: [],
  activePortfolioId: null,
  positions: [],
};
const listeners = new Set<Listener>();

function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function readActiveId(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistActiveId(id: string): void {
  try {
    globalThis.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Storage can be unavailable; the selection then just won't survive a reload.
  }
}

export function getState(): StoreState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function pickActive(portfolios: Portfolio[]): Portfolio | null {
  const remembered = readActiveId();
  return portfolios.find((portfolio) => portfolio.id === remembered) ?? portfolios[0] ?? null;
}

export async function init(): Promise<void> {
  setState({ status: "loading" });
  try {
    const portfolios = await api.listPortfolios();
    const active = pickActive(portfolios);
    const positions = active ? await api.listPositions(active.id) : [];
    if (active) persistActiveId(active.id);
    setState({
      status: "ready",
      portfolios,
      activePortfolioId: active?.id ?? null,
      positions,
      error: undefined,
    });
  } catch (error) {
    setState({ status: "error", error: message(error) });
  }
}

async function refresh(): Promise<void> {
  try {
    const portfolioId = state.activePortfolioId;
    const positions = portfolioId ? await api.listPositions(portfolioId) : [];
    setState({ status: "ready", positions, error: undefined });
  } catch (error) {
    setState({ status: "error", error: message(error) });
  }
}

export async function setActivePortfolio(id: string): Promise<void> {
  if (id === state.activePortfolioId) return;
  setState({ status: "loading", activePortfolioId: id, positions: [] });
  persistActiveId(id);
  await refresh();
}

export async function createPortfolio(name = ""): Promise<Portfolio> {
  const portfolio = await api.createPortfolio(name);
  setState({ portfolios: [...state.portfolios, portfolio] });
  await setActivePortfolio(portfolio.id);
  return portfolio;
}

export async function renamePortfolio(id: string, name: string): Promise<void> {
  const updated = await api.renamePortfolio(id, name);
  setState({
    portfolios: state.portfolios.map((portfolio) => (portfolio.id === id ? updated : portfolio)),
  });
}

export async function addPosition(input: PositionInput): Promise<void> {
  const portfolioId = state.activePortfolioId;
  if (!portfolioId) throw new Error("No active portfolio");
  await api.addPosition(input, portfolioId);
  await refresh();
}

export async function updatePosition(id: string, patch: PositionPatch): Promise<void> {
  await api.updatePosition(id, patch);
  await refresh();
}

export async function removePosition(id: string): Promise<void> {
  await api.removePosition(id);
  await refresh();
}
