import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { cn } from "../../components/ui/utils";
import { Badge } from "../../components/ui/badge";
import type { FormsProviderValue } from "../../../services/auth";
import {
  FORMS_WORKSPACE_ADD_LINK_LABEL,
  FORMS_WORKSPACE_TRANSACTION_LAUNCH_LABEL,
  resolveFormsWorkspaceLaunch,
} from "../../../lib/formsWorkspaceLaunch";

const COPIED_HINT_MS = 1500;

export type TransactionSendDocumentsDialogProps = {
  /** Controlled open state — parent owns the `sendDocsOpen` boolean. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-transaction intake address (`transactions.intake_email`). */
  intakeEmail: string | null;
  /** Per-transaction external workspace URL. Drives the Launch / Add-link branches. */
  externalFormsUrl: string | null;
  /** `null`/`undefined` falls back to generic "Forms Workspace" copy. */
  preferredProvider?: FormsProviderValue | null;
  /** When true, Add/Update buttons are disabled (mirrors `isReadOnly` on the page). */
  disabled?: boolean;
  /** Parent-supplied callback that opens the Add/Update transaction-link dialog. */
  onRequestEditLink: () => void;
};

/**
 * Reusable "Send documents to this transaction" modal. Surfaces the per-transaction intake email
 * (with copy button + transient "Copied ✓" hint) and a primary action derived from
 * {@link resolveFormsWorkspaceLaunch}:
 *
 *   • Transaction workspace URL → "Open Forms Workspace" + provider badge from the URL's domain.
 *   • Named provider fallback (no URL) → opens the configured provider landing URL.
 *   • Other / none / unset → "Add Forms Workspace Link" calling `onRequestEditLink`.
 *   • Saved-but-malformed URL → amber warning + "Update link".
 *
 * The Add/Update transaction-link dialog stays the parent's responsibility — this component
 * opens it via `onRequestEditLink` when needed.
 */
export function TransactionSendDocumentsDialog({
  open,
  onOpenChange,
  intakeEmail,
  externalFormsUrl,
  preferredProvider,
  disabled = false,
  onRequestEditLink,
}: TransactionSendDocumentsDialogProps) {
  const [emailCopied, setEmailCopied] = useState(false);

  const trimmedIntakeEmail = (intakeEmail ?? "").trim();
  const hasIntakeEmail = trimmedIntakeEmail !== "";

  const launchResolution = useMemo(
    () => resolveFormsWorkspaceLaunch(externalFormsUrl, preferredProvider ?? null),
    [externalFormsUrl, preferredProvider]
  );

  // Reset the "Copied" hint each time the modal closes so it doesn't flash on the next open.
  useEffect(() => {
    if (!open) setEmailCopied(false);
  }, [open]);

  // Auto-clear hint after a short delay.
  useEffect(() => {
    if (!emailCopied) return;
    const t = window.setTimeout(() => setEmailCopied(false), COPIED_HINT_MS);
    return () => window.clearTimeout(t);
  }, [emailCopied]);

  async function handleCopyIntakeEmail() {
    if (!hasIntakeEmail) return;
    try {
      await navigator.clipboard.writeText(trimmedIntakeEmail);
      setEmailCopied(true);
    } catch {
      toast.error("Could not copy intake email.");
    }
  }

  function requestEditLinkAndClose() {
    onOpenChange(false);
    onRequestEditLink();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send documents to this transaction</DialogTitle>
          <DialogDescription>
            Email signed documents here to attach them to this transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <p className="text-xs font-medium text-slate-600">Transaction intake email</p>
            {hasIntakeEmail ? (
              <button
                type="button"
                onClick={() => void handleCopyIntakeEmail()}
                className={cn(
                  "group mt-1.5 flex w-full cursor-pointer items-start gap-2 rounded-md border p-2 text-left transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2",
                  emailCopied
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
                aria-label="Copy intake email to clipboard"
              >
                <span className="min-w-0 flex-1 break-all font-mono text-xs leading-snug text-blue-600 group-hover:text-blue-700 group-hover:underline">
                  {trimmedIntakeEmail}
                </span>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center transition-transform duration-200",
                    emailCopied
                      ? "scale-110 text-emerald-600"
                      : "scale-100 text-blue-600 opacity-80 group-hover:opacity-100"
                  )}
                  aria-hidden
                >
                  {emailCopied ? (
                    <Check className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </span>
              </button>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                No intake email is set for this transaction.
              </p>
            )}
            <div className="mt-1 min-h-[1.25rem]" aria-live="polite">
              <p
                className={cn(
                  "text-xs font-medium text-emerald-700 transition-opacity duration-200",
                  emailCopied ? "opacity-100" : "pointer-events-none opacity-0"
                )}
              >
                Copied ✓
              </p>
            </div>
          </div>

          {launchResolution.type === "valid_transaction_url" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild className="min-w-0 flex-1 justify-center gap-2 shadow-sm sm:flex-none">
                  <a
                    href={launchResolution.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onOpenChange(false)}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    {FORMS_WORKSPACE_TRANSACTION_LAUNCH_LABEL}
                  </a>
                </Button>
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                >
                  {launchResolution.badge}
                </Badge>
              </div>
            </div>
          ) : launchResolution.type === "fallback" ? (
            <Button asChild className="w-full justify-center gap-2 shadow-sm">
              <a
                href={launchResolution.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
                {launchResolution.buttonLabel}
              </a>
            </Button>
          ) : launchResolution.type === "invalid_transaction_url" ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-700">
                Saved link is not a valid http/https URL. Update it to launch in a new tab.
              </p>
              <Button
                type="button"
                className="w-full justify-center gap-2 shadow-sm"
                onClick={requestEditLinkAndClose}
                disabled={disabled}
              >
                Update link
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full justify-center gap-2 shadow-sm"
              onClick={requestEditLinkAndClose}
              disabled={disabled}
            >
              {FORMS_WORKSPACE_ADD_LINK_LABEL}
            </Button>
          )}

          {launchResolution.type === "valid_transaction_url" ? (
            <button
              type="button"
              onClick={requestEditLinkAndClose}
              disabled={disabled}
              className="block w-full text-center text-xs text-slate-500 hover:text-slate-700 hover:underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
            >
              Update link
            </button>
          ) : launchResolution.type === "fallback" ? (
            <button
              type="button"
              onClick={requestEditLinkAndClose}
              disabled={disabled}
              className="block w-full text-center text-xs text-slate-500 hover:text-slate-700 hover:underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
            >
              Add transaction workspace link
            </button>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TransactionSendDocumentsDialog;
