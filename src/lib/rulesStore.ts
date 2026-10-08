import { DEFAULT_RULES, normalizeRules, type Rules } from "./domain/ruleset";

const KEY = "horarios:rules";

/** The hotel's rules as saved on this device (the defaults until the manager changes something). */
export function readRules(): Rules {
  try {
    return normalizeRules(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_RULES;
  }
}

export function writeRules(rules: Rules) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeRules(rules)));
  } catch {}
}
