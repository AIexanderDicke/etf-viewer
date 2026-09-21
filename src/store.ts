import type { Position } from "./types.ts";

const STORAGE_KEY = "etf-viewer.positions.v1";

type Listener = (positions: Position[]) => void;

let positions: Position[] = load();
const listeners = new Set<Listener>();

function load(): Position[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Position[]) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage may be unavailable (private mode); the app still works in memory.
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener(positions);
}

export function getPositions(): readonly Position[] {
  return positions;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(positions);
  return () => listeners.delete(listener);
}

export function addPosition(position: Omit<Position, "id">): void {
  const id = crypto.randomUUID();
  positions = [...positions, { ...position, id }];
  emit();
}

export function updatePosition(id: string, patch: Partial<Omit<Position, "id">>): void {
  positions = positions.map((position) =>
    position.id === id ? { ...position, ...patch } : position,
  );
  emit();
}

export function removePosition(id: string): void {
  positions = positions.filter((position) => position.id !== id);
  emit();
}
