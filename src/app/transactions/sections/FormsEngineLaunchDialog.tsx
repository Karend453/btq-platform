import React, { useEffect, useState } from "react";
import { Copy, CheckCircle2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

const ZIPFORMS_URL = "https://www.zipformplus.com";

export type FormsEngineLaunchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intakeEmail: string | null;
};

export default function FormsEngineLaunchDialog({
  open,
  onOpenChange,
  intakeEmail,
}: FormsEngineLaunchDialogProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!open) setCopySuccess(false);
  }, [open]);

  const title = "Open ZipForms";
  const primaryLabel = "Open ZipForms";
  const url = ZIPFORMS_URL;
  const trimmed = intakeEmail?.trim() ?? "";
  const hasEmail = Boolean(trimmed);

  const handleCopy = async () => {
    if (!hasEmail) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setCopySuccess(false);
    }
  };

  const handleOpenSite = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="space-y-1 text-left">
            <span className="block">This will open in a new tab.</span>
            <span className="block">
              If you are not already logged in, sign in once and continue there.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
              <Mail className="h-4 w-4 shrink-0 text-slate-600" />
              Send documents here
            </div>
            {hasEmail ? (
              <p className="break-all font-mono text-sm leading-snug text-blue-900">{trimmed}</p>
            ) : (
              <p className="text-sm text-slate-600">
                No intake email available for this transaction.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!hasEmail}
              onClick={handleCopy}
            >
              {copySuccess ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Intake Email
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-slate-600">
            Email documents to this address to automatically add them to this transaction.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleOpenSite}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
