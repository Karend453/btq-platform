import { type FormsProviderValue, isFormsProviderValue } from "../services/auth";

const SKYSLOPE_FALLBACK_URL = "https://forms.skyslope.com/";
/** Matches placeholder used in forms dialogs (zipForm / Zillow ecosystem). */
const ZIPFORMS_FALLBACK_URL = "https://www.zipformplus.com/";
const DOTLOOP_FALLBACK_URL = "https://www.dotloop.com/";

/** User-facing provider badge when a transaction workspace URL is present. */
export type FormsWorkspaceBadge = "SkySlope" | "zipForm" | "Other";

export type FormsWorkspaceLaunchResolution =
  | {
      type: "valid_transaction_url";
      href: string;
      badge: FormsWorkspaceBadge;
    }
  | { type: "invalid_transaction_url" }
  | { type: "fallback"; href: string; buttonLabel: string }
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
 * Domain-based workspace hint for UI badges (transaction `external_forms_url` is source of truth).
 */
export function detectFormsWorkspaceBadgeFromUrl(rawUrl: string): FormsWorkspaceBadge {
  const u = parseHttpUrl(rawUrl);
  if (!u) return "Other";
  const h = u.hostname.toLowerCase();
  if (h === "forms.skyslope.com" || h === "skyslope.com" || h.endsWith(".skyslope.com")) {
    return "SkySlope";
  }
  if (h.includes("zipform") || h.includes("ziplogix")) {
    return "zipForm";
  }
  return "Other";
}

/** Short label for compact chips (e.g. Documents header). */
export function formsWorkspaceBadgeToChipLabel(badge: FormsWorkspaceBadge): string {
  switch (badge) {
    case "SkySlope":
      return "SkySlope";
    case "zipForm":
      return "zipForm";
    default:
      return "Other";
  }
}

/**
 * Prefer per-transaction URL when present; otherwise user preference with provider-specific
 * fallbacks, or add-link when launch URL is not appropriate.
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
      badge: detectFormsWorkspaceBadgeFromUrl(trimmed),
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
      buttonLabel: "Open SkySlope Forms",
    };
  }
  if (preferredProvider === "zipforms") {
    return {
      type: "fallback",
      href: ZIPFORMS_FALLBACK_URL,
      buttonLabel: "Open ZipForms",
    };
  }
  if (preferredProvider === "dotloop") {
    return {
      type: "fallback",
      href: DOTLOOP_FALLBACK_URL,
      buttonLabel: "Open Dotloop",
    };
  }
  return { type: "add_link" };
}

export const FORMS_WORKSPACE_TRANSACTION_LAUNCH_LABEL = "Open Forms Workspace";

export const FORMS_WORKSPACE_ADD_LINK_LABEL = "Add Forms Workspace Link";
