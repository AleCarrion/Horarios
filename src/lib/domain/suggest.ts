import type { Plan, RepairContext } from "./repair";
import { DEFAULT_RULES, normalizeRules, type Rules } from "./ruleset";

export interface Suggestion {
  kind: "unlock" | "rule";
  /** What to tell the manager (Spanish). */
  text: string;
  /** "unlock": the locked cells that stand in the way. */
  cells?: { staffId: string; date: string }[];
  /** "rule": the setting that would make it work. */
  rule?: Partial<Rules>;
}

const day = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

/**
 * A plan that does not fit the rules is more useful with a way out: which locked cells to release, or which rule to relax.
 * Every suggestion is verified by planning again with that change, so it is never a guess.
 */
export function suggestFor(ctx: RepairContext, plan: Plan, run: (c: RepairContext) => Plan): Suggestion[] {
  if (plan.level !== "red") return [];
  const out: Suggestion[] = [];
  const name = (id: string) => ctx.staff.find((s) => s.id === id)?.name ?? id;

  // 1. locked cells in the way: plan again with no locks and see which locked cells it moves
  const anyLock = Object.values(ctx.locked ?? {}).some((row) => Object.values(row).some(Boolean));
  if (anyLock) {
    const free = run({ ...ctx, locked: {} });
    if (free.level !== "red") {
      const moved = free.changes.filter((c) => ctx.locked?.[c.staffId]?.[c.date]).map((c) => ({ staffId: c.staffId, date: c.date }));
      if (moved.length) {
        const locked = Object.fromEntries(Object.entries(ctx.locked ?? {}).map(([id, row]) => [id, { ...row }]));
        for (const m of moved) delete locked[m.staffId][m.date];
        const check = run({ ...ctx, locked });
        // only those cells if that is enough; otherwise all of them
        const cells = check.level !== "red" ? moved : Object.entries(ctx.locked ?? {}).flatMap(([staffId, row]) => Object.keys(row).filter((d) => row[d]).map((date) => ({ staffId, date })));
        const shown = cells.slice(0, 4).map((c) => `${name(c.staffId)} el ${day(c.date)}`).join(", ");
        out.push({ kind: "unlock", cells, text: `Desbloquea ${cells.length === 1 ? "esta casilla" : `estas ${cells.length} casillas`} (${shown}${cells.length > 4 ? "…" : ""}) y sí cuadra.` });
      }
    }
  }

  // 2. a rule that could give a little
  const base = ctx.rules ?? DEFAULT_RULES;
  const tries: { text: string; rule: Partial<Rules> }[] = [
    { text: `Si se permiten ${base.maxWorkRun + 1} días seguidos de trabajo, sí cuadra.`, rule: { maxWorkRun: base.maxWorkRun + 1 } },
    { text: `Si se permiten ${base.maxRestRun + 1} días libres seguidos, sí cuadra.`, rule: { maxRestRun: base.maxRestRun + 1 } },
    ...(base.onePartido ? [{ text: "Si se permite más de una persona de partido al día, sí cuadra.", rule: { onePartido: false } }] : []),
  ];
  for (const t of tries) if (run({ ...ctx, rules: normalizeRules({ ...base, ...t.rule }) }).level !== "red") out.push({ kind: "rule", text: t.text, rule: t.rule });
  return out;
}
