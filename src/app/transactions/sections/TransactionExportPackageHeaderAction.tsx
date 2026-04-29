import React, { useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import type {
  ClientPortfolioForTransactionSnapshot,
  TransactionExportSnapshot,
} from "../../../services/clientPortfolio";
import { getSignedUrl } from "../../../services/transactionDocuments";

export type TransactionExportPackageHeaderActionProps = {
  /** `undefined` while loading; `null` when no client_portfolio row. */
  portfolioSnapshot: ClientPortfolioForTransactionSnapshot | null | undefined;
  /** Newest `transaction_exports` row; `undefined` while loading. */
  latestExport: TransactionExportSnapshot | null | undefined;
  /** True while finalize-closing submit is mid-flight (mirrors the standalone section). */
  exportBusy?: boolean;
};

type ExportHeaderState =
  | { kind: "loading" }
  | { kind: "not_finalized" }
  | { kind: "no_export_recorded" }
  | { kind: "queued" }
  | { kind: "processing" }
  | { kind: "ready"; storagePath: string; fileName: string }
  | { kind: "failed"; errorMessage: string | null };

function filenameFromStoragePath(path: string): string {
  const seg = path.trim().split("/").filter(Boolean).pop();
  return seg && seg.length > 0 ? seg : "btq-transaction-export.zip";
}

/**
 * Mirrors the state derivation in {@link TransactionExportPackageSection} so we surface the same
 * states/labels in the compact header. Durable `transaction_exports` rows take precedence; legacy
 * `client_portfolio.export_*` columns are the fallback when no durable row exists.
 */
function deriveHeaderState(
  portfolio: ClientPortfolioForTransactionSnapshot | null | undefined,
  latest: TransactionExportSnapshot | null | undefined,
  busy: boolean
): ExportHeaderState {
  const portfolioLoading = portfolio === undefined;
  const exportLoading = latest === undefined;
  if (portfolioLoading || exportLoading) return { kind: "loading" };

  const isFinal = portfolio?.portfolio_stage === "final";
  if (!isFinal) return { kind: "not_finalized" };

  if (latest != null) {
    const path = (latest.zip_storage_path ?? "").trim();
    switch (latest.status) {
      case "ready":
        if (path) {
          return {
            kind: "ready",
            storagePath: path,
            fileName: filenameFromStoragePath(path),
          };
        }
        break;
      case "failed":
        return {
          kind: "failed",
          errorMessage: (latest.error_message ?? "").trim() || null,
        };
      case "processing":
        return { kind: "processing" };
      case "queued":
        return busy ? { kind: "processing" } : { kind: "queued" };
      default:
        break;
    }
  }

  const legacySt = (portfolio?.export_status ?? "").trim().toLowerCase();
  const legacyPath = (portfolio?.export_storage_path ?? "").trim();
  if (legacySt === "ready" && legacyPath) {
    return {
      kind: "ready",
      storagePath: legacyPath,
      fileName:
        (portfolio?.export_file_name ?? "").trim() || filenameFromStoragePath(legacyPath),
    };
  }
  if (legacySt === "failed") return { kind: "failed", errorMessage: null };
  if (legacySt === "pending") return busy ? { kind: "processing" } : { kind: "queued" };
  if (busy) return { kind: "processing" };
  return { kind: "no_export_recorded" };
}

/**
 * Compact Export Package action for the transaction header (replaces the old expanded card/accordion).
 * Reuses the same state derivation, signed-URL download, and copy as the standalone section so we
 * preserve every existing state and action — only placement and presentation change.
 */
export default function TransactionExportPackageHeaderAction({
  portfolioSnapshot,
  latestExport,
  exportBusy = false,
}: TransactionExportPackageHeaderActionProps) {
  const [downloading, setDownloading] = useState(false);

  const state = useMemo(
    () => deriveHeaderState(portfolioSnapshot, latestExport, exportBusy),
    [portfolioSnapshot, latestExport, exportBusy]
  );

  async function handleDownload(storagePath: string, fileName: string) {
    if (!storagePath) {
      toast.error("No export file is available.");
      return;
    }
    setDownloading(true);
    try {
      const url = await getSignedUrl(storagePath);
      if (!url) {
        toast.error("Could not create download link.");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-w-[10.5rem] gap-2 shadow-none"
        aria-label="Loading export package status"
      >
        <Loader2 className="h-4 w-4 animate-spin opacity-70" aria-hidden />
        Export Package
      </Button>
    );
  }

  if (state.kind === "not_finalized") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="min-w-[10.5rem] gap-2 shadow-none cursor-help"
                aria-label="Export package will be created after closing is finalized"
              >
                <Package className="h-4 w-4 opacity-70" aria-hidden />
                Export Package
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-sm">
            An export package will be created after closing is finalized.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.kind === "no_export_recorded") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="min-w-[10.5rem] gap-2 shadow-none cursor-help border-amber-200 bg-amber-50 text-amber-900"
                aria-label="Export package not recorded yet"
              >
                <Package className="h-4 w-4 opacity-80" aria-hidden />
                Export Package
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-sm">
            Transaction is finalized; export status will appear here once recorded.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.kind === "queued") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-w-[10.5rem] gap-2 shadow-none border-amber-200 bg-amber-50 text-amber-900 cursor-default"
        aria-label="Export package queued"
      >
        <Package className="h-4 w-4 opacity-80" aria-hidden />
        Export Queued
      </Button>
    );
  }

  if (state.kind === "processing") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="min-w-[10.5rem] gap-2 shadow-none border-amber-200 bg-amber-50 text-amber-900 cursor-default"
        aria-label="Export package processing"
      >
        <Loader2 className="h-4 w-4 animate-spin opacity-80" aria-hidden />
        Export Processing
      </Button>
    );
  }

  if (state.kind === "ready") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => void handleDownload(state.storagePath, state.fileName)}
        disabled={downloading}
        className="min-w-[10.5rem] gap-2 font-semibold shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
        aria-label={`Download export package ${state.fileName}`}
      >
        <Download className="h-4 w-4" aria-hidden />
        {downloading ? "Preparing…" : "Download Export"}
      </Button>
    );
  }

  if (state.kind === "failed") {
    const tip =
      state.errorMessage ||
      "Export package failed. Closing is still finalized — use the documents below if files are needed immediately.";
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-w-[10.5rem] gap-2 shadow-none border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 cursor-help"
                aria-label="Export package failed"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Export Failed
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-sm">
            {tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}
