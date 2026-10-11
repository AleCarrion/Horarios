import { describe, expect, it } from "vitest";
import { buildUploads, collectLocal, describeLocal, hasLocalData, isLocalDataKey, uploadAll } from "./migration";

const store = (init: Record<string, string>) => {
  const keys = Object.keys(init);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => init[k] ?? null };
};

const data = {
  "horarios:2026-10": JSON.stringify({ ana: { "2026-10-01": "P", "2026-10-02": "D" }, julio: { "2026-10-01": "M" } }),
  "horarios:2026-09": JSON.stringify({ ana: { "2026-09-30": "P" } }),
  "horarios:locks:2026-10": JSON.stringify({ ana: { "2026-10-01": true, "2026-10-02": false } }),
  "horarios:status:2026-09": JSON.stringify({ state: "published", at: "x" }),
  "horarios:requests": JSON.stringify([{ id: "r1", groupId: "g", kind: "libre", staffId: "ana", date: "2026-10-20", createdAt: "x", status: "pending" }]),
  "horarios:rules": JSON.stringify({ maxWorkRun: 6, preferredWorkRun: 5, maxRestRun: 3, onePartido: true, localHolidays: [] }),
  "horarios:queue": "[]",
  "other:key": "1",
};

describe("subir lo de este dispositivo al servidor", () => {
  it("collects months (oldest first), locks, states, requests and rules; ignores the rest", () => {
    const d = collectLocal(store(data));
    expect(d.months.map((m) => `${m.y}-${m.m}`)).toEqual(["2026-9", "2026-10"]);
    expect(d.locks).toHaveLength(1);
    expect(d.states[0]).toMatchObject({ y: 2026, m: 9 });
    expect(d.requests).toHaveLength(1);
    expect(d.rules).not.toBeNull();
    expect(describeLocal(d)).toEqual({ months: 2, requests: 1, locks: 1 });
  });

  it("an empty device has nothing to upload", () => {
    expect(hasLocalData(collectLocal(store({ "horarios:queue": "[]", "other:key": "1" })))).toBe(false);
    expect(hasLocalData(collectLocal(store(data)))).toBe(true);
  });

  it("builds one row per cell, only the locks that are on, and the month decisions", () => {
    const u = buildUploads(collectLocal(store(data)));
    expect(u.cells).toHaveLength(4);
    expect(u.locks).toEqual([{ staff_id: "ana", day: "2026-10-01" }]);
    expect(u.months).toEqual([{ year: 2026, month: 9, status: "published" }]);
    expect(u.requests[0].id).toBe("r1");
  });

  it("uploads table by table in order and in chunks of 500", async () => {
    const calls: { table: string; n: number; onConflict?: string }[] = [];
    const sb = { from: (table: string) => ({ upsert: async (rows: unknown, o?: { onConflict?: string }) => (calls.push({ table, n: (rows as unknown[]).length, onConflict: o?.onConflict }), { error: null }) }) };
    const big = { "horarios:2026-10": JSON.stringify({ ana: Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`d${i}`, "M"])) }) };
    const r = await uploadAll(sb, collectLocal(store(big)));
    expect(r).toEqual({ ok: true, counts: { cells: 1200, requests: 0, locks: 0 } });
    expect(calls.map((c) => c.n)).toEqual([500, 500, 200]);
    expect(calls.every((c) => c.table === "monthly_schedule" && c.onConflict === "staff_id,day")).toBe(true);
  });

  it("stops at the first error and says which table", async () => {
    const sb = { from: (table: string) => ({ upsert: async () => ({ error: table === "requests" ? { message: "permission denied" } : null }) }) };
    const r = await uploadAll(sb, collectLocal(store(data)));
    expect(r).toEqual({ ok: false, error: "requests: permission denied" });
  });

  it("discarding keeps the upload queue and the link flag", () => {
    expect(isLocalDataKey("horarios:2026-10")).toBe(true);
    expect(isLocalDataKey("horarios:queue")).toBe(false);
    expect(isLocalDataKey("horarios:linked:abc")).toBe(false);
    expect(isLocalDataKey("other:key")).toBe(false);
  });
});

describe("la plantilla se sube antes que las casillas", () => {
  it("staff goes first so cells never point at a person the server lacks", async () => {
    const order: string[] = [];
    const sb = { from: (t: string) => ({ upsert: async () => (order.push(t), { error: null }) }) };
    const withTeam = { ...data, "horarios:team": JSON.stringify([{ id: "ana", name: "Ana", role: "senior" }]) };
    await uploadAll(sb, collectLocal(store(withTeam)));
    expect(order[0]).toBe("staff");
    expect(order[1]).toBe("monthly_schedule");
  });
});
