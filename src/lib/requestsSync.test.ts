import { describe, expect, it } from "vitest";
import { fromRequestRows, mergeRequests, toRequestRow } from "./requestsSync";
import type { ShiftRequest } from "./domain/requests";

const r = (over: Partial<ShiftRequest> = {}): ShiftRequest => ({
  id: "a1",
  groupId: "g1",
  kind: "libre",
  staffId: "marcos",
  date: "2026-11-14",
  createdAt: "2026-10-05T10:00:00.000Z",
  status: "pending",
  ...over,
});

describe("request rows", () => {
  it("round-trips every field, using null for the ones that are not set", () => {
    const full = r({ kind: "cambio", withStaffId: "alejandro", returnDate: "2026-11-20", note: "boda", status: "rejected", decidedAt: "2026-10-06T09:00:00.000Z", decisionNote: "no" });
    expect(fromRequestRows([toRequestRow(full)])).toEqual([full]);
    expect(toRequestRow(r())).toMatchObject({ end_date: null, with_staff_id: null, return_date: null, note: null, decided_at: null, decision_note: null });
    expect(fromRequestRows([toRequestRow(r())])).toEqual([r()]);
  });
});

describe("merging local and remote requests", () => {
  it("keeps the server's version of shared ids and adds the ones only this device has", () => {
    const remote = [r({ id: "1", status: "approved" })];
    const local = [r({ id: "1", status: "pending" }), r({ id: "2", date: "2026-11-20" })];
    const merged = mergeRequests(remote, local);
    expect(merged.map((x) => `${x.id}:${x.status}`)).toEqual(["1:approved", "2:pending"]);
  });
});
