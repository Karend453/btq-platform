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
import {
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";

/** "Launch [Provider]" copy used for the modal's primary action. */
const LAUNCH_BUTTON_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Launch Dotloop",
  skyslope: "Launch SkySlope",
  zipforms: "Launch ZipForms",
  other: "Launch Forms Workspace",
  none: "Launch Forms Workspace",
};

/** "Add [Provider] link" copy used when no `external_forms_url` is saved yet. */
const ADD_LINK_BUTTON_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Add Dotloop link",
  skyslope: "Add SkySlope link",
  zipforms: "Add ZipForms link",
  other: "Add forms link",
  none: "Add forms link",
};

const COPIED_HINT_MS = 1500;

/** Browser-side http/https validation; matches the inline shortcut + edit dialog. */
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
 * (with copy button + transient "Copied ✓" hint) and a primary action that depends on the saved
 * `external_forms_url`:
 *
 *   • valid http(s) URL → "Launch [Provider]" anchor opens it in a new tab.
 *   • saved-but-malformed → amber warning + "Update link" calling `onRequestEditLink`.
 *   • no link saved      → "Add [Provider] link" calling `onRequestEditLink`.
 *
 * The Add/Update transaction-link dialog stays the parent's responsibility — this component
 * simply asks the parent to open it via `onRequestEditLink`. That keeps the same UX consistent
 * across surfaces (Documents-header chip, Attach Document drawer, etc.).
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

  const trimmedExisting = (externalFormsUrl ?? "").trim();
  const hasExisting = trimmedExisting !== "";

  const openHref = useMemo(
    () => (hasExisting ? parseHttpUrl(trimmedExisting)?.toString() ?? null : null),
    [hasExisting, trimmedExisting]
  );

  const launchButtonLabel = useMemo(
    () =>
      preferredProvider && isFormsProviderValue(preferredProvider)
        ? LAUNCH_BUTTON_LABELS[preferredProvider]
        : "Launch Forms Workspace",
    [preferredProvider]
  );

  const addLinkButtonLabel = useMemo(
    () =>
      preferredProvider && isFormsProviderValue(preferredProvider)
        ? ADD_LINK_BUTTON_LABELS[preferredProvider]
        : "Add forms link",
    [preferredProvider]
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

          {hasExisting && openHref ? (
            <Button asChild className="w-full justify-center gap-2 shadow-sm">
              <a
                href={openHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
                {launchButtonLabel}
              </a>
            </Button>
          ) : hasExisting ? (
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
              {addLinkButtonLabel}
            </Button>
          )}

          {hasExisting && openHref ? (
            <button
              type="button"
              onClick={requestEditLinkAndClose}
              disabled={disabled}
              className="block w-full text-center text-xs text-slate-500 hover:text-slate-700 hover:underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
            >
              Update link
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
