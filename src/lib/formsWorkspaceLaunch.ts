import { type FormsProviderValue, isFormsProviderValue } from "../services/auth";

const SKYSLOPE_FALLBACK_URL = "https://forms.skyslope.com/";
/**
 * Lone Wolf Transact (zipForm) default landing for an authenticated agent's
 * transactions list. The `#transact` fragment is required by the SPA router;
 * do NOT change it to `#zip`.
 */
const ZIPFORMS_FALLBACK_URL = "https://transact-workflow.lwolf.com/transactions#transact";
const DOTLOOP_FALLBACK_URL = "https://www.dotloop.com/";

export type FormsWorkspaceLaunchResolution =
  | {
      type: "valid_transaction_url";
      href: string;
    }
  | { type: "invalid_transaction_url" }
  | { type: "fallback"; href: string }
  | { type: "add_link" };

function parseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Prefer per-transaction URL when present; otherwise user preference with provider-specific
 * fallback URLs, or add-link when launch URL is not appropriate.
 */
export function resolveFormsWorkspaceLaunch(
  externalFormsUrl: string | null | undefined,
  preferredProvider: FormsProviderValue | null | undefined
): FormsWorkspaceLaunchResolution {
  const trimmed = (externalFormsUrl ?? "").trim();
  if (trimmed !== "") {
    const href = parseHttpUrl(trimmed)?.toString() ?? null;
    if (!href) return { type: "invalid_transaction_url" };
    return {
      type: "valid_transaction_url",
      href,
    };
  }

  if (!preferredProvider || !isFormsProviderValue(preferredProvider)) {
    return { type: "add_link" };
  }
  if (preferredProvider === "other" || preferredProvider === "none") {
    return { type: "add_link" };
  }
  if (preferredProvider === "skyslope") {
    return {
      type: "fallback",
      href: SKYSLOPE_FALLBACK_URL,
    };
  }
  if (preferredProvider === "zipforms") {
    return {
      type: "fallback",
      href: ZIPFORMS_FALLBACK_URL,
    };
  }
  if (preferredProvider === "dotloop") {
    return {
      type: "fallback",
      href: DOTLOOP_FALLBACK_URL,
    };
  }
  return { type: "add_link" };
}

export const FORMS_WORKSPACE_TRANSACTION_LAUNCH_LABEL = "Open Forms";

export const FORMS_WORKSPACE_ADD_LINK_LABEL = "Add Forms Workspace Link";

/** Providers we can render a context label for. Excludes "other"/"none". */
export type RecognizedFormsProvider = "skyslope" | "dotloop" | "zipforms";

const RECOGNIZED_PROVIDER_LABELS: Record<RecognizedFormsProvider, string> = {
  skyslope: "SkySlope",
  dotloop: "Dotloop",
  zipforms: "ZipForms",
};

export type FormsProviderDisplay = {
  providerKey: RecognizedFormsProvider;
  providerLabel: string;
  /**
   * `linked` means the pasted URL itself was recognized as belonging to this provider
   * (e.g. forms.skyslope.com). `using` means we only know the user's preferred provider.
   */
  mode: "linked" | "using";
};

/**
 * Future extension point: classify a pasted forms URL by hostname.
 * Returns `null` today; intentionally structured so callers (e.g. the New Transaction
 * wizard) can switch to "{Provider} transaction linked" copy once detection lands.
 */
export function detectFormsProviderFromUrl(
  externalFormsUrl: string | null | undefined
): RecognizedFormsProvider | null {
  void externalFormsUrl;
  return null;
}

/**
 * Resolves the lightweight provider-context label shown near the "Open Forms" button.
 * - Prefers URL-derived detection (mode `linked`) when available.
 * - Falls back to the user's preferred provider (mode `using`).
 * - Returns `null` for `other` / `none` / unset / unrecognized providers so the UI
 *   can hide the hint entirely.
 */
export function resolveFormsProviderDisplay(
  externalFormsUrl: string | null | undefined,
  preferredProvider: FormsProviderValue | null | undefined
): FormsProviderDisplay | null {
  const detected = detectFormsProviderFromUrl(externalFormsUrl);
  if (detected) {
    return {
      providerKey: detected,
      providerLabel: RECOGNIZED_PROVIDER_LABELS[detected],
      mode: "linked",
    };
  }

  if (
    preferredProvider &&
    isFormsProviderValue(preferredProvider) &&
    preferredProvider !== "other" &&
    preferredProvider !== "none"
  ) {
    return {
      providerKey: preferredProvider,
      providerLabel: RECOGNIZED_PROVIDER_LABELS[preferredProvider],
      mode: "using",
    };
  }

  return null;
}

/** Human-readable text for the context hint, matching the design copy. */
export function formatFormsProviderDisplay(display: FormsProviderDisplay): string {
  return display.mode === "linked"
    ? `${display.providerLabel} transaction linked`
    : `Using ${display.providerLabel}`;
}
