"use client";

import { useSyncExternalStore } from "react";
import { applyCatalog, DEFAULT_CATALOG, normalizeCatalog, type Catalog } from "./domain/catalog";

// Same name style as the other stores (horarios:*) so backups carry the hotel's look with them.
const KEY = "horarios:catalog";

let current: Catalog = DEFAULT_CATALOG;
let version = 0;
const listeners = new Set<() => void>();

/** The hotel's names, letters, hours and colours as saved on this device (the defaults until someone changes something). */
export function readCatalog(): Catalog {
  try {
    return normalizeCatalog(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_CATALOG;
  }
}

/**
 * Makes `next` the catalog of the whole app (live tables + subscribers) and, unless told otherwise, keeps it on this device.
 * `remount: false` is for the settings page itself, which is being edited and must not be rebuilt while typing.
 */
export function setCatalog(next: Catalog, { persist = true, remount = true }: { persist?: boolean; remount?: boolean } = {}) {
  const clean = normalizeCatalog(next);
  if (remount && JSON.stringify(clean) !== JSON.stringify(current)) version++;
  current = clean;
  applyCatalog(current);
  if (persist)
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {}
  listeners.forEach((l) => l());
}

/** Loads the saved catalog once per page load. */
let started = false;
export function startCatalog() {
  if (started) return;
  started = true;
  setCatalog(readCatalog(), { persist: false });
}

/** Re-renders the component whenever the catalog changes (it reads SHIFTS/SECTIONS, which are rewritten in place). */
export function useCatalog(): Catalog {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULT_CATALOG,
  );
}

/** Changes whenever the catalog does: the app uses it as a `key` so everything is painted again with the new names and colours. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
}
