/**
 * Real schedule of October 2026 (Thursday 1st), transcribed from the hotel's Excel by reading cell colours.
 * Keyed by position, not by name. Codes: S supervision, P partido, M/T/N, z = mozo shift, . = rest.
 */
export const OCTOBER_2026_REAL: Record<string, string> = {
  director: "SS..SSSSS...SSSS..SSSSS..SSSSS.",
  senior_a: "PP..PPPP.PP..PPP..PPP..PPPPP.PP",
  senior_b: "MMPP..MMPT.PPM..PP.MMPP..TTTP..",
  recep_1: "..MNNNN.T.TTTTT...TTTT.MMN...MM",
  recep_2: "..TTTT..MMMMM..TTTNN..T..MMMT.N",
  recep_3: "TT.MMMTT..NN..MMMMM..MMTT...MTT",
  night_auditor: "NNN....NNN..NNNNNN..NNNNN.NNNN.",
  mozo_1: "zz.....zzzzz....zzzz.....zzzzz.",
  mozo_2: "..zzzzz.....zzzz....zzzzz.....z",
};
