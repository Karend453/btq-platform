import React, { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { cn } from "../../components/ui/utils";
import {
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";
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
 * Compact inline forms / e-sign shortcut for the Documents header. The chip itself never opens an
 * external URL directly anymore — clicking it opens the Send Documents modal, which surfaces the
 * transaction's intake email + a "Launch [Provider]" button (or "Add [Provider] link" when no
 * `external_forms_url` is saved). The Add/Update transaction-link modal is reused unchanged for
 * the URL form. When no preferred provider is set, the chip becomes a Settings link.
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

  const providerLabel = useMemo(() => {
    if (preferredProvider && isFormsProviderValue(preferredProvider)) {
      return PROVIDER_LABELS[preferredProvider];
    }
    return null;
  }, [preferredProvider]);

  function openSendDocsModal() {
    setSendDocsOpen(true);
  }

  function openAddOrUpdateLinkModal() {
    setSendDocsOpen(false);
    setDialogOpen(true);
  }

  // Loading state — render nothing so the header doesn't flicker.
  if (preferredProvider === undefined) {
    return null;
  }

  // No preferred provider configured — subtle settings link, no modal.
  if (preferredProvider === null) {
    return (
      <RouterLink
        to="/settings?tab=forms-provider"
        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
      >
        Set forms provider
      </RouterLink>
    );
  }

  // Provider is set (named, "Other", or explicit "None"). The provider name itself is the chip:
  //   • link saved   → blue/clickable, opens Send Documents modal
  //   • no link yet  → muted text, opens Add/Update link modal directly
  const chipTitle = hasExisting
    ? "Open forms + copy transaction email"
    : "Add forms link";

  return (
    <>
      <div className="inline-flex items-center text-xs whitespace-nowrap">
        <button
          type="button"
          onClick={hasExisting ? openSendDocsModal : openAddOrUpdateLinkModal}
          title={chipTitle}
          aria-label={chipTitle}
          className={cn(
            "font-medium underline-offset-2 hover:underline",
            hasExisting
              ? "text-blue-600 hover:text-blue-700"
              : "text-slate-700 hover:text-slate-900"
          )}
        >
          {providerLabel}
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
