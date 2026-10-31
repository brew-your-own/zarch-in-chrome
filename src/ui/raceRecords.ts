/** A map's best race: its time, the clock at each gate, and its ghost (see `RaceState.ghost`). */
export interface RaceRecord {
  time: number;
  splits: number[];
  ghost: number[];
}

const KEY = 'zarch.race.v1';

function loadAll(): Record<string, RaceRecord> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RaceRecord>) : {};
  } catch {
    return {};
  }
}

/** The best race on `mapId`, or null if none was saved (or storage is unavailable). */
export function loadRecord(mapId: string): RaceRecord | null {
  const record = loadAll()[mapId];
  if (!record || typeof record.time !== 'number' || !Array.isArray(record.ghost) || !Array.isArray(record.splits)) return null;
  // JSON has no NaN; a wrecked frame was saved as null.
  return { ...record, ghost: record.ghost.map((v) => (typeof v === 'number' ? v : NaN)) };
}

/** Saves `record` as the best on `mapId` if it beats the one saved; returns whether it did. */
export function saveRecord(mapId: string, record: RaceRecord): boolean {
  const all = loadAll();
  const old = all[mapId];
  if (old && typeof old.time === 'number' && old.time <= record.time) return false;
  // Millimetres and milliradians are plenty for a ghost, and keep the stored run small.
  all[mapId] = { ...record, ghost: record.ghost.map((v) => (Number.isNaN(v) ? NaN : Math.round(v * 1000) / 1000)) };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the record lives for this session only.
  }
  return true;
}
