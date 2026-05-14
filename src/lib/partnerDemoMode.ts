import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Partner Demo Mode
 * ----------------------------------------------------------------------------
 * A reversible, presentation-layer-only visibility flag used during vendor /
 * partner demos. When enabled, the UI hides transaction-management-specific
 * workflow details (compliance counters, finalize actions, checklist statuses,
 * etc.) so BTQ is presented as a brokerage operations / orchestration platform.
 *
 * NOTHING here changes backend permissions, RLS, or the data that gets fetched.
 * It is purely UI visibility — toggle off and everything is back to normal.
 *
 * How to enable:
 *  1. Build/deploy time: set `VITE_PARTNER_DEMO_MODE=1` (or "true") in the env.
 *  2. Runtime (no rebuild): in DevTools console run
 *       window.__btqSetPartnerDemoMode(true)
 *     or visit any page with `?partner_demo=1` once (it persists in
 *     localStorage). Use `?partner_demo=0` to clear.
 *
 * URL param toggling is intentionally cheap to undo (just visit with `=0`),
 * so partner demos can be set up and torn down without code changes.
 */

const STORAGE_KEY = "btq:partner-demo-mode";
const STORAGE_EVENT = "btq:partner-demo-mode:changed";
const URL_PARAM = "partner_demo";

/** Label used for the Transactions nav entry when demo mode is on. */
export const PARTNER_DEMO_TRANSACTIONS_LABEL = "Operations";

function parseBoolish(value: string | undefined | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function readFromEnv(): boolean {
  try {
    return parseBoolish(import.meta.env.VITE_PARTNER_DEMO_MODE as string | undefined);
  } catch {
    return false;
  }
}

function readFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return parseBoolish(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * True when partner demo mode should be active. The env flag is OR'd with the
 * localStorage override so either source can enable it; localStorage can also
 * be forced to "0" to disable an env-enabled deployment for a single browser
 * (handy for support / debugging).
 */
export function isPartnerDemoMode(): boolean {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw != null) return parseBoolish(raw);
    } catch {
      // fall through to env
    }
  }
  return readFromEnv();
}

/**
 * Persist a runtime override. Pass `null` to clear the override and fall back
 * to the env flag. Broadcasts a custom event so subscribers in the same tab
 * update immediately (the native `storage` event only fires cross-tab).
 */
export function setPartnerDemoMode(enabled: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled == null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Apply a `?partner_demo=1|0` URL param if present. Returns true when the
 * param was applied so callers (e.g. the app shell) can strip it from the URL.
 */
export function applyPartnerDemoModeFromUrl(searchParams: URLSearchParams): boolean {
  const raw = searchParams.get(URL_PARAM);
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "clear" || v === "reset") {
    setPartnerDemoMode(null);
    return true;
  }
  setPartnerDemoMode(parseBoolish(v));
  return true;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(STORAGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORAGE_EVENT, handler);
  };
}

/**
 * React hook returning the current demo-mode state. Re-renders when the flag
 * is toggled in this tab (custom event) or any other tab (`storage` event).
 */
export function usePartnerDemoMode(): boolean {
  // SSR-safe snapshot: env-only on the server, env+localStorage in the browser.
  const getSnapshot = () => isPartnerDemoMode();
  const getServerSnapshot = () => readFromEnv();
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * One-shot URL bootstrap. Mount this once near the app root; it reads the
 * `?partner_demo=…` query string on first render and removes it from the URL
 * so the param doesn't linger across navigations.
 */
export function usePartnerDemoUrlBootstrap(): void {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done) return;
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (applyPartnerDemoModeFromUrl(url.searchParams)) {
        url.searchParams.delete(URL_PARAM);
        const cleaned = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}${url.hash}`;
        window.history.replaceState({}, "", cleaned);
      }
    } finally {
      setDone(true);
    }
  }, [done]);
}

/**
 * Returns the label for the Transactions nav entry. Centralizes the label
 * choice so the sidebar (and anything else that surfaces it) stay in sync.
 */
export function getTransactionsNavLabel(demoMode = isPartnerDemoMode()): string {
  return demoMode ? PARTNER_DEMO_TRANSACTIONS_LABEL : "Transactions";
}

// DevTools convenience: surface a setter on window so partners-facing engineers
// can flip the flag from the browser console without touching the codebase.
if (typeof window !== "undefined") {
  (window as unknown as {
    __btqSetPartnerDemoMode?: (enabled: boolean | null) => void;
    __btqIsPartnerDemoMode?: () => boolean;
  }).__btqSetPartnerDemoMode = setPartnerDemoMode;
  (window as unknown as {
    __btqSetPartnerDemoMode?: (enabled: boolean | null) => void;
    __btqIsPartnerDemoMode?: () => boolean;
  }).__btqIsPartnerDemoMode = isPartnerDemoMode;
}
