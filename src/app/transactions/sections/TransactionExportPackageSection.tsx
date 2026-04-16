import React, { useMemo, useState } from "react";
import { ChevronDown, Download, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { cn } from "../../components/ui/utils";
import type {
  ClientPortfolioForTransactionSnapshot,
  TransactionExportSnapshot,
} from "../../../services/clientPortfolio";
import { getSignedUrl } from "../../../services/transactionDocuments";

type TransactionExportPackageSectionProps = {
  portfolioSnapshot: ClientPortfolioForTransactionSnapshot | null | undefined;
  /** Newest row from `transaction_exports`; undefined = loading. */
  latestExport: TransactionExportSnapshot | null | undefined;
  exportBusy?: boolean;
};

function formatExportTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function filenameFromStoragePath(path: string): string {
  const seg = path.trim().split("/").filter(Boolean).pop();
  return seg && seg.length > 0 ? seg : "btq-transaction-export.zip";
}

function statusStripLabel(
  loading: boolean,
  isFinal: boolean,
  exportReady: boolean,
  status: TransactionExportSnapshot["status"] | null,
  exportBusy: boolean,
  legacyPending: boolean
): string {
  if (loading) return "Loading…";
  if (!isFinal) return "Not requested";
  if (exportBusy) return "Working…";
  if (exportReady) return "Ready";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Creating…";
  if (status === "queued") return "Queued";
  if (legacyPending) return "Creating…";
  if (status === "ready") return "Ready";
  return "Not requested";
}

export default function TransactionExportPackageSection({
  portfolioSnapshot,
  latestExport,
  exportBusy = false,
}: TransactionExportPackageSectionProps) {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);

  const portfolioLoading = portfolioSnapshot === undefined;
  const exportLoading = latestExport === undefined;
  const loading = portfolioLoading || exportLoading;

  const isFinal = portfolioSnapshot?.portfolio_stage === "final";

  const legacyPath = (portfolioSnapshot?.export_storage_path ?? "").trim();
  const legacyReady =
    isFinal &&
    (portfolioSnapshot?.export_status ?? "").trim().toLowerCase() === "ready" &&
    legacyPath !== "";
  const legacyPending =
    isFinal &&
    (portfolioSnapshot?.export_status ?? "").trim().toLowerCase() === "pending";

  const durablePath = (latestExport?.zip_storage_path ?? "").trim();
  const durableReady =
    isFinal && latestExport?.status === "ready" && durablePath !== "";

  const exportReady = durableReady || (latestExport === null && legacyReady);

  const downloadStoragePath = durableReady
    ? durablePath
    : latestExport === null && legacyReady
      ? legacyPath
      : "";
  const downloadFileName = durableReady
    ? filenameFromStoragePath(durablePath)
    : (portfolioSnapshot?.export_file_name ?? "").trim() || "btq-transaction-export.zip";

  const exportFailed =
    isFinal &&
    (latestExport?.status === "failed" ||
      (latestExport === null &&
        (portfolioSnapshot?.export_status ?? "").trim().toLowerCase() === "failed"));

  const exportPending =
    exportBusy ||
    (isFinal &&
      latestExport != null &&
      (latestExport.status === "queued" || latestExport.status === "processing")) ||
    (latestExport === null && legacyPending);

  const shortStatus = useMemo(
    () =>
      statusStripLabel(
        loading,
        isFinal,
        exportReady,
        latestExport?.status ?? null,
        exportBusy,
        legacyPending
      ),
    [loading, isFinal, exportReady, latestExport?.status, exportBusy, legacyPending]
  );

  const primaryMessage = useMemo(() => {
    if (loading || !isFinal) return null;
    if (latestExport) {
      switch (latestExport.status) {
        case "queued":
          return "Export package queued";
        case "processing":
          return "Export package creating";
        case "ready":
          return "Export package ready";
        case "failed":
          return "Export package failed";
        default:
          return null;
      }
    }
    if (legacyReady) return "Export package ready";
    if (legacyPending) return "Export package creating";
    if ((portfolioSnapshot?.export_status ?? "").trim().toLowerCase() === "failed") {
      return "Export package failed";
    }
    return null;
  }, [loading, isFinal, latestExport, legacyReady, legacyPending, portfolioSnapshot]);

  const showRetentionHelper = isFinal && !loading && !exportReady;

  async function handleDownload() {
    const path = downloadStoragePath;
    const name = downloadFileName;
    if (!path) {
      toast.error("No export file is available.");
      return;
    }
    setDownloading(true);
    try {
      const url = await getSignedUrl(path);
      if (!url) {
        toast.error("Could not create download link.");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  }

  const cardClass =
    !isFinal
      ? "border-slate-200 border-dashed bg-slate-50/50 shadow-sm"
      : exportReady
        ? "border-emerald-200/90 bg-emerald-50/50 shadow-sm"
        : exportPending
          ? "border-amber-200/90 bg-amber-50/50 shadow-sm"
          : exportFailed
            ? "border-amber-300/90 bg-amber-50/70 shadow-sm"
            : "border-amber-200/90 bg-amber-50/50 shadow-sm";

  const packageIconClass =
    !isFinal
      ? "text-slate-600"
      : exportReady
        ? "text-emerald-600"
        : exportPending
          ? "text-amber-600"
          : exportFailed
            ? "text-amber-800"
            : "text-amber-600";

  const stripBg = useMemo(() => {
    if (loading) return "border-slate-200 bg-slate-50/90";
    if (!isFinal) return "border-slate-200 bg-slate-50/80";
    if (exportFailed) return "border-amber-300/90 bg-amber-50/70";
    if (exportPending) return "border-amber-200/80 bg-amber-50/50";
    if (exportReady) return "border-emerald-200/80 bg-emerald-50/60";
    return "border-amber-200/80 bg-amber-50/50";
  }, [loading, isFinal, exportFailed, exportPending, exportReady]);

  const statusTextClass = cn(
    "text-sm",
    exportFailed && "font-medium text-amber-950",
    exportReady && "text-emerald-800",
    exportPending && "text-amber-900",
    !isFinal && !exportFailed && !exportReady && !exportPending && !loading && "text-slate-600",
    loading && "text-slate-500"
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left outline-none transition-colors",
            "hover:brightness-[1.01] focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-2",
            stripBg
          )}
          aria-expanded={open}
        >
          <Package className={cn("h-4 w-4 shrink-0", packageIconClass)} aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Export Package
          </span>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <span className={cn("min-w-0 flex-1 truncate", statusTextClass)}>{shortStatus}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden">
        <Card className={cn("mt-2 rounded-lg border shadow-sm", cardClass)}>
          <CardHeader className="space-y-1.5 px-4 pb-2 pt-4">
            {!loading && !isFinal ? (
              <p className="text-xs leading-relaxed text-slate-600">
                No export package has been requested yet.{" "}
                <span className="text-slate-500">
                  After you finalize closing, BTQ records an export request for this transaction.
                </span>
              </p>
            ) : null}
            {isFinal && primaryMessage ? (
              <p
                className={cn(
                  "text-xs leading-relaxed",
                  exportReady && "text-emerald-900/90",
                  exportFailed && "font-medium text-amber-950",
                  !exportReady && !exportFailed && "text-amber-800/90"
                )}
              >
                {primaryMessage}
              </p>
            ) : null}
            {isFinal && !primaryMessage && !loading ? (
              <p className="text-xs text-amber-800/90">
                Transaction is finalized; export status will appear here once recorded.
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            {loading ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : !isFinal ? (
              <p className="text-sm text-slate-600">
                Finalize closing to queue an export package. A ZIP download will appear here when the
                package is ready.
              </p>
            ) : exportPending ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  {latestExport?.status === "queued"
                    ? "Your export request is queued."
                    : latestExport?.status === "processing"
                      ? "Your export package is being generated."
                      : "Export package is being prepared…"}
                </p>
                {showRetentionHelper ? (
                  <p className="text-xs text-slate-500">Source file retention not started</p>
                ) : null}
              </div>
            ) : exportFailed ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p className="font-medium text-amber-900">Export package failed</p>
                {(latestExport?.error_message ?? "").trim() ? (
                  <p className="text-slate-600">{latestExport?.error_message}</p>
                ) : (
                  <p className="text-slate-600">
                    Closing is still finalized. Use the documents below if you need files
                    immediately.
                  </p>
                )}
                {showRetentionHelper ? (
                  <p className="text-xs text-slate-500">Source file retention not started</p>
                ) : null}
              </div>
            ) : exportReady ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div>
                    <span className="text-slate-500">Requested</span>
                    <p className="font-medium text-slate-900">
                      {formatExportTimestamp(
                        latestExport?.requested_at ?? portfolioSnapshot?.export_created_at
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">File name</span>
                    <p className="break-all font-medium text-slate-900">{downloadFileName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Status</span>
                    <p className="font-medium text-slate-900 capitalize">
                      {latestExport?.status ?? portfolioSnapshot?.export_status ?? "—"}
                    </p>
                  </div>
                  {(portfolioSnapshot?.finalized_at ?? "").trim() ? (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Finalized at</span>
                      <p className="font-medium text-slate-900">
                        {formatExportTimestamp(portfolioSnapshot?.finalized_at)}
                      </p>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shadow-none"
                  disabled={downloading}
                  onClick={() => void handleDownload()}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloading ? "Preparing…" : "Download Export Package"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-700">
                <p className="text-amber-900/90">
                  Transaction is finalized; no export request is on file for this closing yet.
                </p>
                {showRetentionHelper ? (
                  <p className="text-xs text-slate-500">Source file retention not started</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
