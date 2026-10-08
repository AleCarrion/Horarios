import { describe, expect, it } from "vitest";
import { backupName, createBackup, describeBackup, parseBackup, restoreBackup } from "./backup";

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    all: () => Object.fromEntries(m),
  };
}

const data = {
  "horarios:2026-10": JSON.stringify({ a: { "2026-10-01": "M" } }),
  "horarios:team": JSON.stringify([{ id: "a" }, { id: "b" }]),
  "horarios:requests": JSON.stringify([{ id: "r" }]),
  "horarios:locks:2026-10": JSON.stringify({ a: { "2026-10-01": true } }),
  "horarios:queue": JSON.stringify([{ x: 1 }]),
  "other:thing": "keep me",
};

describe("copia de seguridad", () => {
  it("copies only the app's data (not the upload queue, not other sites' keys)", () => {
    const b = createBackup(fakeStorage(data), "2026-10-08T10:00:00Z");
    expect(Object.keys(b.entries).sort()).toEqual(["horarios:2026-10", "horarios:locks:2026-10", "horarios:requests", "horarios:team"]);
    expect(backupName(b)).toBe("horarios-copia-2026-10-08.json");
  });

  it("round trip: restoring on an empty or messy device leaves exactly the copied data", () => {
    const b = createBackup(fakeStorage(data));
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.ok).toBe(true);
    const target = fakeStorage({ "horarios:2026-11": "{}", "horarios:team": "[]", "other:thing": "keep me", "horarios:queue": "[1]" });
    restoreBackup(target, (parsed as { backup: typeof b }).backup);
    const after = target.all();
    expect(after["horarios:2026-11"]).toBeUndefined(); // not in the copy: gone, like the day it was made
    expect(after["horarios:team"]).toBe(data["horarios:team"]);
    expect(after["other:thing"]).toBe("keep me");
    expect(after["horarios:queue"]).toBe("[1]");
  });

  it("rejects files that are not ours or are damaged", () => {
    expect(parseBackup("no json")).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: "horarios", version: 2, entries: {} }))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: "horarios", version: 1, entries: { "evil:key": "1" } }))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: "horarios", version: 1, entries: { "horarios:team": "{broken" } }))).toMatchObject({ ok: false });
  });

  it("describes what a copy holds", () => {
    expect(describeBackup(createBackup(fakeStorage(data)))).toEqual({ months: 1, people: 2, requests: 1 });
  });
});
