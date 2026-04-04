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
import type { ClientPortfolioForTransactionSnapshot } from "../../../services/clientPortfolio";
import { getSignedUrl } from "../../../services/transactionDocuments";

type TransactionExportPackageSectionProps = {
  portfolioSnapshot: ClientPortfolioForTransactionSnapshot | null | undefined;
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

function statusStripLabel(
  loading: boolean,
  isFinal: boolean,
  exportReady: boolean,
  exportPending: boolean,
  exportFailed: boolean
): string {
  if (loading) return "Loading…";
  if (!isFinal) return "Not created";
  if (exportFailed) return "Failed";
  if (exportPending) return "Creating…";
  if (exportReady) return "Ready";
  return "Pending";
}

export default function TransactionExportPackageSection({
  portfolioSnapshot,
  exportBusy = false,
}: TransactionExportPackageSectionProps) {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);

  const loading = portfolioSnapshot === undefined;
  const isFinal = portfolioSnapshot?.portfolio_stage === "final";
  const exportReady =
    isFinal &&
    portfolioSnapshot?.export_status === "ready" &&
    (portfolioSnapshot?.export_storage_path ?? "").trim() !== "";
  const exportFailed = isFinal && portfolioSnapshot?.export_status === "failed";
  const exportPending =
    exportBusy || (isFinal && portfolioSnapshot?.export_status === "pending");

  const exportAmberHold =
    isFinal && !exportReady && !exportPending && !exportFailed && !loading;

  const shortStatus = useMemo(
    () => statusStripLabel(loading, isFinal, exportReady, exportPending, exportFailed),
    [loading, isFinal, exportReady, exportPending, exportFailed]
  );

  async function handleDownload() {
    const path = portfolioSnapshot?.export_storage_path?.trim();
    const name = portfolioSnapshot?.export_file_name?.trim() || "btq-transaction-export.zip";
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
    exportAmberHold && "text-amber-900",
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
                No export package has been created yet.{" "}
                <span className="text-slate-500">
                  An export package is created when the transaction is finalized.
                </span>
              </p>
            ) : null}
            {isFinal && exportReady ? (
              <p className="text-xs leading-relaxed text-emerald-900/90">
                BTQ creates a downloadable ZIP of this transaction’s files for your records (separate
                from the Documents list below).
              </p>
            ) : isFinal && exportPending ? (
              <p className="text-xs text-amber-800/90">Export package is being created…</p>
            ) : isFinal && exportFailed ? (
              <p className="text-xs font-medium text-amber-950">
                Export failed — transaction is still finalized. Details below.
              </p>
            ) : exportAmberHold ? (
              <p className="text-xs text-amber-800/90">
                Transaction is finalized, but the export package is not ready yet.
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            {loading ? (
              <p className="text-sm text-slate-600">Loading…</p>
            ) : !isFinal ? (
              <p className="text-sm text-slate-600">
                After you finalize closing, a ZIP download will appear here.
              </p>
            ) : exportPending ? (
              <p className="text-sm text-slate-700">Creating export package…</p>
            ) : exportFailed ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  Export status: <span className="font-medium text-amber-900">failed</span>
                </p>
                <p className="text-slate-600">
                  Closing was finalized, but the ZIP export could not be generated. Use the documents
                  below if you need files immediately.
                </p>
              </div>
            ) : exportReady ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div>
                    <span className="text-slate-500">Created</span>
                    <p className="font-medium text-slate-900">
                      {formatExportTimestamp(portfolioSnapshot?.export_created_at)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">File name</span>
                    <p className="break-all font-medium text-slate-900">
                      {portfolioSnapshot?.export_file_name ?? "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Export status</span>
                    <p className="font-medium text-slate-900 capitalize">
                      {portfolioSnapshot?.export_status ?? "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Created by</span>
                    <p className="break-all font-medium text-slate-900">
                      {(portfolioSnapshot?.export_created_by_email ?? "").trim() || "—"}
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
                  {(portfolioSnapshot?.retention_delete_at ?? "").trim() ? (
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Retention delete after</span>
                      <p className="font-medium text-slate-900">
                        {formatExportTimestamp(portfolioSnapshot?.retention_delete_at)}
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
            ) : exportAmberHold ? (
              <p className="text-sm text-amber-900/90">
                Transaction is finalized, but the export package is not ready yet.
              </p>
            ) : (
              <p className="text-sm text-slate-600">No export package created yet.</p>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
