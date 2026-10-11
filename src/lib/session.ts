/** Small flags that live only while the tab is open. */
const GUEST = "horarios:guest";
const RECOVERY = "horarios:recovery";

const get = (k: string) => {
  try {
    return sessionStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const set = (k: string, on: boolean) => {
  try {
    if (on) sessionStorage.setItem(k, "1");
    else sessionStorage.removeItem(k);
  } catch {}
};

/** The person chose "just look at the schedule" instead of signing in. */
export const isGuest = () => get(GUEST);
export const setGuest = (on: boolean) => set(GUEST, on);
/** The "reset password" link was opened in this tab: a new password must be chosen before anything else. */
export const isRecovery = () => get(RECOVERY);
export const setRecovery = (on: boolean) => set(RECOVERY, on);
