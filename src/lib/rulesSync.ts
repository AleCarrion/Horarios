import { normalizeRules, type Rules } from "./domain/ruleset";

/** `public.app_rules` row: a single row with the hotel's rules as JSON. */
export interface RulesRow {
  id: 1;
  rules: unknown;
}

export const toRulesRow = (r: Rules): RulesRow => ({ id: 1, rules: normalizeRules(r) });
/** Whatever is on the server is cleaned the same way as anything typed by hand. */
export const fromRulesRow = (row: Pick<RulesRow, "rules">): Rules => normalizeRules(row.rules as Partial<Rules>);
