import type { Position, PositionInput } from "../shared/types.ts";
import { api } from "./api.ts";

export interface StoreState {
  status: "loading" | "ready" | "error";
  error?: string;
  positions: Position[];
}

type Listener = (state: StoreState) => void;

let state: StoreState = { status: "loading", positions: [] };
const listeners = new Set<Listener>();

function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export function getState(): StoreState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function init(): Promise<void> {
  setState({ status: "loading" });
  try {
    const positions = await api.listPositions();
    setState({ status: "ready", positions, error: undefined });
  } catch (error) {
    setState({ status: "error", error: message(error) });
  }
}

async function refresh(): Promise<void> {
  try {
    const positions = await api.listPositions();
    setState({ status: "ready", positions, error: undefined });
  } catch (error) {
    setState({ status: "error", error: message(error) });
  }
}

export async function addPosition(input: PositionInput): Promise<void> {
  await api.addPosition(input);
  await refresh();
}

export async function removePosition(id: string): Promise<void> {
  await api.removePosition(id);
  await refresh();
}
