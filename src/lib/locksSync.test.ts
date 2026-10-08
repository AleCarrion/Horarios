import { describe, expect, it } from "vitest";
import { diffLocks, locksFromRows, locksToRows, unionLocks } from "./locksSync";

describe("locks <-> rows", () => {
  it("round-trips", () => {
    const l = { marcos: { "2026-11-14": true, "2026-11-15": true }, jc: { "2026-11-02": true } };
    expect(locksFromRows(locksToRows(l))).toEqual(l);
  });

  it("ignores falsy entries", () => {
    expect(locksToRows({ marcos: { "2026-11-14": false, "2026-11-15": true } })).toEqual([{ staff_id: "marcos", day: "2026-11-15" }]);
  });
});

describe("diffLocks", () => {
  it("lists what to add and what to remove on the server", () => {
    const server = { marcos: { "2026-11-14": true, "2026-11-15": true } };
    const now = { marcos: { "2026-11-15": true }, jc: { "2026-11-02": true } };
    expect(diffLocks(server, now)).toEqual({
      add: [{ staff_id: "jc", day: "2026-11-02" }],
      remove: [{ staff_id: "marcos", day: "2026-11-14" }],
    });
  });

  it("nothing to do when they match", () => {
    expect(diffLocks({ a: { "2026-11-01": true } }, { a: { "2026-11-01": true } })).toEqual({ add: [], remove: [] });
  });
});

describe("unionLocks", () => {
  it("keeps locks from both sides", () => {
    expect(unionLocks({ a: { x: true } }, { a: { y: true }, b: { z: true } })).toEqual({ a: { x: true, y: true }, b: { z: true } });
  });
});
