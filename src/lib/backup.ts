/** A full copy of everything the app keeps on this device (team, months, requests, locks, rules…). */
export interface Backup {
  app: "horarios";
  version: 1;
  createdAt: string;
  entries: Record<string, string>;
}

const PREFIX = "horarios:";
/** Pending uploads belong to this device only: restoring them elsewhere would replay old edits. */
const SKIP = new Set(["horarios:queue"]);

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const keysOf = (s: Store) => Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k && k.startsWith(PREFIX) && !SKIP.has(k));

export function createBackup(store: Store, now: string = new Date().toISOString()): Backup {
  const entries: Record<string, string> = {};
  for (const k of keysOf(store)) {
    const v = store.getItem(k);
    if (v !== null) entries[k] = v;
  }
  return { app: "horarios", version: 1, createdAt: now, entries };
}

export function backupName(b: Backup) {
  return `horarios-copia-${b.createdAt.slice(0, 10)}.json`;
}

/** Returns the backup, or a message in Spanish saying why the file is not one of ours. */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es una copia de seguridad (no se puede leer)." };
  }
  const b = data as Partial<Backup> | null;
  if (!b || b.app !== "horarios" || typeof b.entries !== "object" || b.entries === null) return { ok: false, error: "Este archivo no es una copia de seguridad de Horarios." };
  if (b.version !== 1) return { ok: false, error: "Esta copia es de una versión que esta aplicación no entiende." };
  for (const [k, v] of Object.entries(b.entries)) {
    if (!k.startsWith(PREFIX) || SKIP.has(k) || typeof v !== "string") return { ok: false, error: "La copia contiene datos que no son de Horarios." };
    try {
      JSON.parse(v);
    } catch {
      return { ok: false, error: "La copia está dañada." };
    }
  }
  return { ok: true, backup: b as Backup };
}

/** Replaces everything on this device with the backup (what is not in it disappears, exactly like the day it was made). */
export function restoreBackup(store: Store, backup: Backup): number {
  for (const k of keysOf(store)) store.removeItem(k);
  for (const [k, v] of Object.entries(backup.entries)) store.setItem(k, v);
  return Object.keys(backup.entries).length;
}

/** What a copy contains, for the confirmation message. */
export function describeBackup(b: Backup): { months: number; people: number; requests: number } {
  const keys = Object.keys(b.entries);
  const count = (key: string) => {
    try {
      const v = JSON.parse(b.entries[key] ?? "[]");
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  };
  return { months: keys.filter((k) => /^horarios:\d{4}-\d{1,2}$/.test(k)).length, people: count("horarios:team"), requests: count("horarios:requests") };
}
