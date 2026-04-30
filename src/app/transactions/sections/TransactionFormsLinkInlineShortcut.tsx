import React, { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { cn } from "../../components/ui/utils";
import {
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";
import {
  detectFormsWorkspaceBadgeFromUrl,
  formsWorkspaceBadgeToChipLabel,
  resolveFormsWorkspaceLaunch,
} from "../../../lib/formsWorkspaceLaunch";
import { TransactionFormsLinkEditDialog } from "./TransactionFormsLinkEditDialog";
import { TransactionSendDocumentsDialog } from "./TransactionSendDocumentsDialog";

const PROVIDER_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Dotloop",
  skyslope: "SkySlope",
  zipforms: "ZipForms",
  /** "Other" / "None" intentionally collapse to a generic label so the chip stays compact. */
  other: "Forms",
  none: "Forms",
};

export type TransactionFormsLinkInlineShortcutProps = {
  transactionId: string;
  externalFormsUrl: string | null;
  /** Per-transaction intake address (`transactions.intake_email`); empty string OK if missing. */
  intakeEmail: string | null;
  /** Current user's preferred provider; `undefined` = still loading; `null` = not set. */
  preferredProvider: FormsProviderValue | null | undefined;
  /** Mirrors `isReadOnly` on the page (e.g. archived transactions). */
  disabled?: boolean;
  /** Called after a successful save/remove so the page can refresh `transaction.external_forms_url`. */
  onSaved?: (nextUrl: string | null) => void;
};

/**
 * Compact inline forms / e-sign shortcut for the Documents header. Clicking opens either the
 * Send Documents modal (intake + launch from transaction URL, provider fallback URL, or update
 * flow) or the Add/Update link dialog when no launch URL is available.
 */
export function TransactionFormsLinkInlineShortcut({
  transactionId,
  externalFormsUrl,
  intakeEmail,
  preferredProvider,
  disabled = false,
  onSaved,
}: TransactionFormsLinkInlineShortcutProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendDocsOpen, setSendDocsOpen] = useState(false);

  const trimmedExisting = (externalFormsUrl ?? "").trim();
  const hasExisting = trimmedExisting !== "";

  const launchResolution = useMemo(
    () => resolveFormsWorkspaceLaunch(externalFormsUrl, preferredProvider ?? null),
    [externalFormsUrl, preferredProvider]
  );

  const providerLabel = useMemo(() => {
    if (preferredProvider && isFormsProviderValue(preferredProvider)) {
      return PROVIDER_LABELS[preferredProvider];
    }
    return null;
  }, [preferredProvider]);

  const chipDisplayLabel = useMemo(() => {
    if (hasExisting) {
      return formsWorkspaceBadgeToChipLabel(detectFormsWorkspaceBadgeFromUrl(trimmedExisting));
    }
    if (providerLabel) return providerLabel;
    return "Forms";
  }, [hasExisting, trimmedExisting, providerLabel]);

  function openSendDocsModal() {
    setSendDocsOpen(true);
  }

  function openAddOrUpdateLinkModal() {
    setSendDocsOpen(false);
    setDialogOpen(true);
  }

  function handleChipClick() {
    if (
      launchResolution.type === "add_link" ||
      launchResolution.type === "invalid_transaction_url"
    ) {
      openAddOrUpdateLinkModal();
    } else {
      openSendDocsModal();
    }
  }

  // Wait for profile only when we cannot yet derive a chip label from a saved transaction URL.
  if (preferredProvider === undefined && !hasExisting) {
    return null;
  }

  if (preferredProvider === null && !hasExisting) {
    return (
      <RouterLink
        to="/settings?tab=forms-provider"
        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
      >
        Set forms provider
      </RouterLink>
    );
  }

  const chipTitle = hasExisting
    ? "Open forms + copy transaction email"
    : launchResolution.type === "fallback"
      ? "Open forms workspace (fallback) + copy transaction email"
      : "Add or update forms workspace link";

  return (
    <>
      <div className="inline-flex items-center text-xs whitespace-nowrap">
        <button
          type="button"
          onClick={handleChipClick}
          title={chipTitle}
          aria-label={chipTitle}
          className={cn(
            "font-medium underline-offset-2 hover:underline",
            launchResolution.type === "valid_transaction_url" || launchResolution.type === "fallback"
              ? "text-blue-600 hover:text-blue-700"
              : "text-slate-700 hover:text-slate-900"
          )}
        >
          {chipDisplayLabel}
        </button>
      </div>

      <TransactionSendDocumentsDialog
        open={sendDocsOpen}
        onOpenChange={setSendDocsOpen}
        intakeEmail={intakeEmail}
        externalFormsUrl={externalFormsUrl}
        preferredProvider={preferredProvider}
        disabled={disabled}
        onRequestEditLink={openAddOrUpdateLinkModal}
      />

      <TransactionFormsLinkEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transactionId={transactionId}
        externalFormsUrl={externalFormsUrl}
        preferredProvider={preferredProvider}
        disabled={disabled}
        onSaved={onSaved}
      />
    </>
  );
}

export default TransactionFormsLinkInlineShortcut;
