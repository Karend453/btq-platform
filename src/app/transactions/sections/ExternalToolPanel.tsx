import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";

export type ExternalToolPanelContentProps = {
  toolName: string;
  launchUrl: string;
  intakeEmail: string;
  showEmail: boolean;
};

const COPIED_MS = 1200;

export function ExternalToolPanelContent({
  toolName,
  launchUrl,
  intakeEmail,
  showEmail,
}: ExternalToolPanelContentProps) {
  const [isCopied, setIsCopied] = useState(false);
  const trimmed = intakeEmail.trim();
  const hasEmail = Boolean(trimmed);

  useEffect(() => {
    if (!isCopied) return;
    const t = window.setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => window.clearTimeout(t);
  }, [isCopied]);

  const handleCopy = async () => {
    if (!hasEmail) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  const handleLaunch = () => {
    window.open(launchUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      {showEmail ? (
        <>
          <div>
            <p className="text-xs font-medium text-slate-600">
              Send documents to this transaction
            </p>
            {hasEmail ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className={cn(
                    "group mt-1.5 flex w-full cursor-pointer items-start gap-2 rounded-md border p-1.5 text-left transition-all duration-300",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2",
                    isCopied
                      ? "border-blue-500 bg-blue-50 hover:border-blue-500 hover:bg-blue-50"
                      : "border-gray-200 hover:border-slate-200/70 hover:bg-slate-50/60"
                  )}
                  aria-label="Copy intake email to clipboard"
                >
                  <span className="min-w-0 flex-1 break-all font-mono text-xs leading-snug text-blue-600 underline-offset-2 group-hover:text-blue-700 group-hover:underline">
                    {trimmed}
                  </span>
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center transition-transform duration-300",
                      isCopied
                        ? "scale-110 text-emerald-600"
                        : "scale-100 text-blue-600 opacity-75 transition-[color,opacity,transform] duration-300 group-hover:text-blue-800 group-hover:opacity-100"
                    )}
                    aria-hidden
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </span>
                </button>
                <div className="mt-1.5 min-h-[1.25rem]" aria-live="polite">
                  <p
                    className={cn(
                      "text-xs font-medium text-emerald-700 transition-opacity duration-300",
                      isCopied ? "opacity-100" : "pointer-events-none opacity-0"
                    )}
                  >
                    Copied ✓
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-xs leading-snug text-slate-500">
                No intake email for this transaction.
              </p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Email signed documents here to automatically attach to this transaction
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 shadow-none"
            onClick={handleLaunch}
          >
            <span>Launch {toolName}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">Open your CRM workspace</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 shadow-none"
            onClick={handleLaunch}
          >
            <span>Launch {toolName}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}
