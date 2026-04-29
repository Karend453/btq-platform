import React, { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ExternalLink, FileSignature, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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

const PROVIDER_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Dotloop",
  skyslope: "SkySlope",
  zipforms: "ZipForms",
  other: "Other",
  none: "None",
};

const OPEN_BUTTON_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Open Dotloop",
  skyslope: "Open SkySlope",
  zipforms: "Open ZipForms",
  other: "Open Forms Workspace",
  none: "Open Forms Workspace",
};

const PROVIDER_PLACEHOLDERS: Record<FormsProviderValue, string> = {
  dotloop: "https://www.dotloop.com/my/loop/...",
  skyslope: "https://app.skyslope.com/files/...",
  zipforms: "https://www.zipformplus.com/transactions/...",
  other: "https://...",
  none: "https://...",
};

const FALLBACK_PLACEHOLDER = "https://...";

/** Browser-side http/https validation; matches backend-agnostic URL semantics. */
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
 * Empty-state helper text that nods to the viewer's preferred provider so the CTA reads naturally.
 * `other` and `none` (explicit "no provider") fall back to the generic "forms/e-sign" wording, same
 * as when the provider has not been set yet — saying "Add your None file…" would not make sense.
 */
function buildEmptyStateHelperText(provider: FormsProviderValue | null | undefined): string {
  const isNamedProvider =
    provider === "dotloop" || provider === "skyslope" || provider === "zipforms";
  const noun = isNamedProvider ? PROVIDER_LABELS[provider] : "forms/e-sign";
  return `Add your ${noun} file, loop, envelope, or workspace link so you can jump back to it anytime.`;
}

/** Hostname-only label for the saved link (e.g. `app.skyslope.com`); generic fallback if parsing fails. */
function buildLinkedWorkspaceLabel(rawUrl: string): string {
  const u = parseHttpUrl(rawUrl);
  if (!u) return "Saved link";
  const host = u.hostname.trim();
  return host !== "" ? host : "Saved link";
}

export type TransactionFormsLinkCardProps = {
  transactionId: string;
  externalFormsUrl: string | null;
  /** Current user's preferred provider; `undefined` = still loading; `null` = not set. */
  preferredProvider: FormsProviderValue | null | undefined;
  /** Mirrors `isReadOnly` on the page (e.g. archived transactions). */
  disabled?: boolean;
  /** Called after a successful save so the page can refresh `transaction.external_forms_url`. */
  onSaved?: (nextUrl: string | null) => void;
};

/**
 * Per-transaction shortcut to a forms / e-sign workspace (Dotloop loop, SkySlope file,
 * ZipForms workspace, etc.). Provider is read from the viewer's `user_profiles.preferred_forms_provider`
 * — never duplicated on the transaction. Save uses {@link updateTransaction} so RLS / permissions
 * match the existing edit path. No credentials, tokens, or usernames are stored.
 */
export function TransactionFormsLinkCard({
  transactionId,
  externalFormsUrl,
  preferredProvider,
  disabled = false,
  onSaved,
}: TransactionFormsLinkCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const trimmedExisting = (externalFormsUrl ?? "").trim();
  const hasExisting = trimmedExisting !== "";

  const providerLabel = useMemo(() => {
    if (preferredProvider === undefined) return "Loading…";
    if (preferredProvider == null) return null;
    return PROVIDER_LABELS[preferredProvider] ?? null;
  }, [preferredProvider]);

  const openButtonLabel = useMemo(() => {
    if (preferredProvider && isFormsProviderValue(preferredProvider)) {
      return OPEN_BUTTON_LABELS[preferredProvider];
    }
    return "Open Forms Workspace";
  }, [preferredProvider]);

  const placeholder = useMemo(() => {
    if (preferredProvider && isFormsProviderValue(preferredProvider)) {
      return PROVIDER_PLACEHOLDERS[preferredProvider];
    }
    return FALLBACK_PLACEHOLDER;
  }, [preferredProvider]);

  useEffect(() => {
    if (!dialogOpen) return;
    setDraftUrl(trimmedExisting);
    setDraftError(null);
  }, [dialogOpen, trimmedExisting]);

  /** Validated `href` for the Open anchor — null when the saved value is not a usable http(s) URL. */
  const openHref = useMemo(() => {
    if (!hasExisting) return null;
    return parseHttpUrl(trimmedExisting)?.toString() ?? null;
  }, [hasExisting, trimmedExisting]);

  const linkedWorkspaceLabel = useMemo(
    () => buildLinkedWorkspaceLabel(trimmedExisting),
    [trimmedExisting]
  );

  const emptyStateHelperText = useMemo(
    () => buildEmptyStateHelperText(preferredProvider),
    [preferredProvider]
  );

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
      setDialogOpen(false);
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove link.");
    } finally {
      setRemoving(false);
    }
  }

  const showProviderRow = preferredProvider !== undefined;
  const noProviderSet = preferredProvider === null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
            <FileSignature className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="text-base">Forms / E-Sign</CardTitle>
            {showProviderRow ? (
              providerLabel ? (
                <p className="text-xs text-slate-600">
                  Provider:{" "}
                  <span className="font-medium text-slate-800">{providerLabel}</span>
                </p>
              ) : noProviderSet ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Set your forms provider in{" "}
                  <RouterLink
                    to="/settings?tab=forms-provider"
                    className="text-blue-600 underline-offset-2 hover:underline"
                  >
                    Settings
                  </RouterLink>{" "}
                  to personalize this shortcut.
                </p>
              ) : null
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        {hasExisting ? (
          <>
            <p className="text-xs text-slate-500">
              Linked workspace:{" "}
              <span className="font-medium text-slate-800 break-all">{linkedWorkspaceLabel}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {openHref ? (
                <Button asChild variant="default" size="sm" className="gap-1.5">
                  <a href={openHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    {openButtonLabel}
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled
                  className="gap-1.5"
                  title="Saved link is not a valid http/https URL"
                >
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  {openButtonLabel}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={disabled}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5 opacity-70" aria-hidden />
                Update link
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRemoveLink()}
                disabled={disabled || removing}
                className="gap-1.5 text-slate-600 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5 opacity-70" aria-hidden />
                {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 leading-relaxed">{emptyStateHelperText}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={disabled}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5 opacity-70" aria-hidden />
              Add transaction link
            </Button>
          </>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hasExisting ? "Update transaction link" : "Add transaction link"}</DialogTitle>
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
                Must start with http:// or https://. 
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default TransactionFormsLinkCard;
