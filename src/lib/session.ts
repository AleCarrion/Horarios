/** Small flags that live only while the tab is open. */
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

/** The "reset password" link was opened in this tab: a new password must be chosen before anything else. */
export const isRecovery = () => get(RECOVERY);
export const setRecovery = (on: boolean) => set(RECOVERY, on);

export type StoredRole = "admin" | "editor" | "worker";
const ROLE = "horarios_role"; // not "horarios:" so it is not part of the data backups
/** The last known role of the signed-in person, so menus can adapt before the server answers. */
export const getStoredRole = (): StoredRole | null => {
  try {
    const v = localStorage.getItem(ROLE);
    return v === "admin" || v === "editor" || v === "worker" ? v : null;
  } catch {
    return null;
  }
};
export const setStoredRole = (r: StoredRole | null) => {
  try {
    if (r) localStorage.setItem(ROLE, r);
    else localStorage.removeItem(ROLE);
  } catch {}
};

const INVITE = "horarios_invite";
/** The code of the invitation link being used: kept until the account exists (the e-mail confirmation may take a while). */
export const getInviteCode = (): string | null => {
  try {
    return localStorage.getItem(INVITE);
  } catch {
    return null;
  }
};
export const setInviteCode = (code: string | null) => {
  try {
    if (code) localStorage.setItem(INVITE, code);
    else localStorage.removeItem(INVITE);
  } catch {}
};
