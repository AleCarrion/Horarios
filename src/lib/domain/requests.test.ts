import { describe, expect, it } from "vitest";
import { competing, createRequests, decide, planForRequest, requestMonth, sortRequests, validateNew, type ShiftRequest } from "./requests";
import { DEFAULT_STAFF } from "./roster";
import { generateSchedule } from "./generator";
import { isOff } from "./types";

const NOW = "2026-10-05T10:00:00.000Z";
const base = { staffId: "marcos", note: "boda", now: NOW };

describe("creating requests", () => {
  it("a libre request is one pending request with a stable id", () => {
    const [r] = createRequests({ kind: "libre", date: "2026-11-14", ...base });
    expect(r).toMatchObject({ kind: "libre", staffId: "marcos", date: "2026-11-14", status: "pending", createdAt: NOW, note: "boda" });
    expect(r.id).toBeTruthy();
  });

  it("holidays across a month boundary are split into one request per month, sharing a group", () => {
    const rs = createRequests({ kind: "vacaciones", date: "2026-10-28", endDate: "2026-11-03", ...base });
    expect(rs).toHaveLength(2);
    expect(rs[0]).toMatchObject({ date: "2026-10-28", endDate: "2026-10-31" });
    expect(rs[1]).toMatchObject({ date: "2026-11-01", endDate: "2026-11-03" });
    expect(rs[0].groupId).toBe(rs[1].groupId);
    expect(new Set(rs.map((r) => r.id)).size).toBe(2);
  });

  it("a shift swap keeps who with whom and the optional return day", () => {
    const [r] = createRequests({ kind: "cambio", date: "2026-11-10", withStaffId: "alejandro", returnDate: "2026-11-20", ...base });
    expect(r).toMatchObject({ kind: "cambio", withStaffId: "alejandro", returnDate: "2026-11-20" });
  });

  it("validates the form", () => {
    const staff = DEFAULT_STAFF;
    expect(validateNew({ kind: "libre", staffId: "", date: "2026-11-14" }, staff)).toMatch(/persona/i);
    expect(validateNew({ kind: "libre", staffId: "marcos", date: "" }, staff)).toMatch(/fecha|día/i);
    expect(validateNew({ kind: "vacaciones", staffId: "marcos", date: "2026-11-14", endDate: "2026-11-10" }, staff)).toMatch(/fin|antes/i);
    expect(validateNew({ kind: "cambio", staffId: "marcos", date: "2026-11-14" }, staff)).toMatch(/con quién|otra persona/i);
    expect(validateNew({ kind: "cambio", staffId: "marcos", withStaffId: "marcos", date: "2026-11-14" }, staff)).toMatch(/distint/i);
    expect(validateNew({ kind: "libre", staffId: "marcos", date: "2026-11-14" }, staff)).toBeNull();
  });
});

describe("deciding and sorting", () => {
  const [a, b, c] = ["2026-11-20", "2026-11-14", "2026-11-14"].map((date, i) => ({ ...createRequests({ kind: "libre", date, staffId: "marcos", now: `2026-10-0${i + 1}T10:00:00.000Z` })[0] }));

  it("decide stamps the status, the moment and the note without mutating", () => {
    const d = decide(a, "rejected", "Ese día no hay refuerzo", "2026-10-06T09:00:00.000Z");
    expect(d).toMatchObject({ status: "rejected", decidedAt: "2026-10-06T09:00:00.000Z", decisionNote: "Ese día no hay refuerzo" });
    expect(a.status).toBe("pending");
  });

  it("pending first, by the day asked for, then by when it was asked", () => {
    const done = decide(b, "approved", undefined, "2026-10-06T09:00:00.000Z");
    expect(sortRequests([a, done, c]).map((r) => r.id)).toEqual([c.id, a.id, done.id]);
  });
});

describe("competing requests", () => {
  it("finds other people's pending requests that overlap in time", () => {
    const mine = createRequests({ kind: "libre", date: "2026-11-14", staffId: "marcos", now: NOW })[0];
    const same = createRequests({ kind: "libre", date: "2026-11-14", staffId: "alejandro", now: NOW })[0];
    const range = createRequests({ kind: "vacaciones", date: "2026-11-12", endDate: "2026-11-16", staffId: "alberto-r", now: NOW })[0];
    const other = createRequests({ kind: "libre", date: "2026-11-20", staffId: "alejandro", now: NOW })[0];
    const own = createRequests({ kind: "libre", date: "2026-11-14", staffId: "marcos", now: NOW })[0];
    const resolved: ShiftRequest = { ...same, id: "x", status: "approved" };
    expect(competing([mine, same, range, other, own, resolved], mine).map((r) => r.staffId).sort()).toEqual(["alberto-r", "alejandro"]);
  });
});

describe("evaluating a request with the engine", () => {
  const base2 = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF }).schedule;
  const ctx = { year: 2026, month: 11, staff: DEFAULT_STAFF, schedule: base2 };

  it("a libre request becomes a rest-day swap; a swap request exchanges shifts", () => {
    const who = DEFAULT_STAFF.find((s) => s.role === "receptionist" && !isOff(base2[s.id]["2026-11-14"]))!;
    const [req] = createRequests({ kind: "libre", date: "2026-11-14", staffId: who.id, now: NOW });
    const plan = planForRequest(ctx, req);
    expect(plan.strategy).toBe("swap");
    expect(plan.schedule[who.id]["2026-11-14"]).toBe("D");
  });

  it("holidays are planned as V", () => {
    const [req] = createRequests({ kind: "vacaciones", date: "2026-11-12", endDate: "2026-11-13", staffId: "marcos", now: NOW });
    const plan = planForRequest(ctx, req);
    expect(plan.schedule.marcos["2026-11-12"]).toBe("V");
    expect(plan.schedule.marcos["2026-11-13"]).toBe("V");
  });

  it("knows which month it belongs to", () => {
    expect(requestMonth({ date: "2026-11-14" })).toEqual({ year: 2026, month: 11 });
  });
});
