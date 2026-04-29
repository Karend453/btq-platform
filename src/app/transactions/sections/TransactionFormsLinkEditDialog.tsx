import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";
import { updateTransaction } from "../../../services/transactions";

const PROVIDER_PLACEHOLDERS: Record<FormsProviderValue, string> = {
  dotloop: "https://www.dotloop.com/my/loop/...",
  skyslope: "https://app.skyslope.com/files/...",
  zipforms: "https://www.zipformplus.com/transactions/...",
  other: "https://...",
  none: "https://...",
};

const FALLBACK_PLACEHOLDER = "https://...";

/** Browser-side http/https validation; matches the inline shortcut's semantics. */
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

export type TransactionFormsLinkEditDialogProps = {
  /** Controlled — the parent owns whether the dialog is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  /** Current value of `transactions.external_forms_url`; `null`/empty means no link is saved. */
  externalFormsUrl: string | null;
  /** Drives placeholder hint copy. `undefined`/`null` falls back to a generic URL placeholder. */
  preferredProvider?: FormsProviderValue | null;
  /** When true, save & remove are disabled (mirrors `isReadOnly` on the page). */
  disabled?: boolean;
  /** Fires after a successful save or remove so the page can refresh `external_forms_url`. */
  onSaved?: (nextUrl: string | null) => void;
};

/**
 * Self-contained Add / Update transaction-link dialog. Extracted from
 * `TransactionFormsLinkInlineShortcut` so the same UX can be triggered from multiple surfaces
 * (Documents header chip + Attach Document drawer) without duplicating the URL-validation /
 * `updateTransaction` save / remove logic.
 */
export function TransactionFormsLinkEditDialog({
  open,
  onOpenChange,
  transactionId,
  externalFormsUrl,
  preferredProvider,
  disabled = false,
  onSaved,
}: TransactionFormsLinkEditDialogProps) {
  const [draftUrl, setDraftUrl] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const trimmedExisting = (externalFormsUrl ?? "").trim();
  const hasExisting = trimmedExisting !== "";

  const placeholder =
    preferredProvider && isFormsProviderValue(preferredProvider)
      ? PROVIDER_PLACEHOLDERS[preferredProvider]
      : FALLBACK_PLACEHOLDER;

  // Each open seeds the draft from the saved value; closing keeps the user out of a stale draft.
  useEffect(() => {
    if (!open) return;
    setDraftUrl(trimmedExisting);
    setDraftError(null);
  }, [open, trimmedExisting]);

  async function handleSubmitSave() {
    setDraftError(null);
    const trimmed = draftUrl.trim();
    if (trimmed === "") {
      setDraftError("Enter a link, or use Cancel to keep the current value.");
      return;
    }
    const parsed = parseHttpUrl(trimmed);
    if (!parsed) {
      setDraftError("Enter a valid http or https URL.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await updateTransaction(transactionId, {
        externalFormsUrl: parsed.toString(),
      });
      if (error) {
        const message = error.message || "Could not save link.";
        setDraftError(message);
        toast.error(message);
        return;
      }
      toast.success("Forms link saved.");
      onSaved?.(parsed.toString());
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save link.";
      setDraftError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveLink() {
    if (!hasExisting || removing || disabled) return;
    setRemoving(true);
    try {
      const { error } = await updateTransaction(transactionId, {
        externalFormsUrl: null,
      });
      if (error) {
        toast.error(error.message || "Could not remove link.");
        return;
      }
      toast.success("Forms link removed.");
      onSaved?.(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove link.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block the dialog from closing while a save is mid-flight, identical to the previous
        // inline behavior.
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasExisting ? "Update transaction link" : "Add transaction link"}
          </DialogTitle>
          <DialogDescription>
            Paste the URL to this transaction's external forms or e-sign workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="transaction-forms-link" className="text-sm font-medium text-slate-700">
            Transaction forms link
          </Label>
          <Input
            id="transaction-forms-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={draftUrl}
            onChange={(e) => {
              setDraftUrl(e.target.value);
              if (draftError) setDraftError(null);
            }}
            disabled={saving}
            aria-invalid={draftError ? true : undefined}
          />
          {draftError ? (
            <p className="text-xs text-red-600" role="alert">
              {draftError}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Must start with http:// or https://. We will not store any login info.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
          {hasExisting ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRemoveLink()}
              disabled={saving || removing || disabled}
              className="gap-1.5 text-slate-600 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5 opacity-70" aria-hidden />
              {removing ? "Removing…" : "Remove link"}
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitSave()}
              disabled={saving || disabled}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TransactionFormsLinkEditDialog;
