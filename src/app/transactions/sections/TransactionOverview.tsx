import React, { useMemo } from "react";
import { Copy, Loader2, Lock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  formatUnifiedCommissionPercentDisplay,
  type TransactionRow,
} from "../../../services/transactions";
import type {
  ClientPortfolioForTransactionSnapshot,
  TransactionExportSnapshot,
} from "../../../services/clientPortfolio";
import TransactionExportPackageHeaderAction from "./TransactionExportPackageHeaderAction";

function formatPortfolioClosingDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

type TransactionOverviewSectionProps = {
  row: TransactionRow & {
    client_name?: string | null;
    client?: string | null;
    office_name?: string | null;
  };
  title: string;
  officeValue: string;
  /** Agent of record for this deal (list/buyer); shown for admin review context. */
  agentDisplayName?: string | null;
  formatCurrency: (value?: number | string | null) => string;
  onSave: () => void;
  onEdit: () => void;
  /** `undefined` = loading; `null` = no client_portfolio row */
  portfolioSnapshot?: ClientPortfolioForTransactionSnapshot | null;
  /** Newest `transaction_exports` row; `undefined` while loading. */
  latestExport?: TransactionExportSnapshot | null;
  /** True while Finalize modal submit is running (primary button loading label). */
  finalizeInProgress?: boolean;
  onFinalizeClosingClick?: () => void;
  finalizeClosingDisabled?: boolean;
  /** Inbox documents not linked to any checklist row — must be resolved before finalizing. */
  unattachedInboxDocumentCount?: number;
  /** Per-transaction intake email; moved here from the Transaction card so it's always visible. */
  intakeEmail?: string | null;
  /** Copy handler — fires page-level toast/clipboard logic. */
  onCopyIntakeEmail?: (text?: string | null) => void;
};

/** `pending` = spinner (processing only, or legacy client “pending” ZIP build). `queued` = static lock. */
type ExportPackageLockState = "ready" | "pending" | "queued" | "failed" | "unknown";

function SummaryField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-base font-normal leading-snug text-slate-900 break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function TransactionOverviewSection({
  row,
  title,
  officeValue,
  agentDisplayName,
  formatCurrency,
  onSave,
  onEdit,
  portfolioSnapshot,
  latestExport,
  finalizeInProgress = false,
  onFinalizeClosingClick,
  finalizeClosingDisabled,
  unattachedInboxDocumentCount = 0,
  intakeEmail,
  onCopyIntakeEmail,
}: TransactionOverviewSectionProps) {
  const trimmedIntakeEmail = (intakeEmail ?? "").trim();
  const hasIntakeEmail = trimmedIntakeEmail !== "";
  const portfolioStage = portfolioSnapshot?.portfolio_stage;
  const isFinalized = portfolioStage === "final";
  const portfolioLoading = portfolioSnapshot === undefined;

  const exportPackageLockState = useMemo((): ExportPackageLockState | null => {
    if (!isFinalized || portfolioLoading) return null;

    const legacySt = portfolioSnapshot?.export_status?.trim().toLowerCase();
    const legacyPath = (portfolioSnapshot?.export_storage_path ?? "").trim();

    if (latestExport === undefined) {
      if (legacySt === "failed") return "failed";
      if (legacySt === "ready" && legacyPath) return "ready";
      if (legacySt === "pending") return "pending";
      return "unknown";
    }

    if (latestExport !== null) {
      const st = latestExport.status;
      const path = (latestExport.zip_storage_path ?? "").trim();
      if (st === "failed") return "failed";
      if (st === "ready" && path) return "ready";
      if (st === "processing") return "pending";
      if (st === "queued") return "queued";
      return "unknown";
    }

    if (legacySt === "failed") return "failed";
    if (legacySt === "ready" && legacyPath) return "ready";
    if (legacySt === "pending") return "pending";
    return "unknown";
  }, [isFinalized, portfolioLoading, portfolioSnapshot, latestExport]);

  const exportPackageFullyReady = exportPackageLockState === "ready";

  const exportLockTooltip = useMemo(() => {
    if (exportPackageLockState === "ready") return "Export package ready";
    if (exportPackageLockState === "failed") return "Export package failed";
    if (exportPackageLockState === "queued") return "Export package queued";
    if (exportPackageLockState === "pending") {
      if (latestExport?.status === "processing") return "Export package creating";
      return "Export package is being created";
    }
    return "Transaction is finalized, but the export package is not ready yet.";
  }, [exportPackageLockState, latestExport?.status]);

  const finalizedBadgeTooltip = useMemo(() => {
    if (exportPackageLockState === "queued") return "Export package queued";
    if (exportPackageLockState === "pending") {
      if (latestExport?.status === "processing") return "Export package creating";
      return "Export package is being created";
    }
    if (exportPackageLockState === "failed") return "Export package failed";
    if (exportPackageLockState === "unknown") {
      const st = (portfolioSnapshot?.export_status ?? "").trim();
      if (!st) return "Export package not created yet";
      return "Transaction is finalized, but the export package is not ready yet.";
    }
    return "Export package not created yet";
  }, [exportPackageLockState, latestExport?.status, portfolioSnapshot]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex shrink-0 flex-col border-b border-slate-200 pb-3 sm:border-b-0 sm:border-r sm:border-slate-200 sm:pb-0 sm:pr-4">
            <Button variant="outline" size="sm" onClick={onSave} className="shadow-none">
              Save
            </Button>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h1>
              {isFinalized ? (
                portfolioLoading ? (
                  <Badge
                    variant="secondary"
                    className="font-normal border border-slate-200 bg-slate-50 text-slate-800"
                  >
                    Closing finalized
                  </Badge>
                ) : exportPackageFullyReady ? (
                  <Badge
                    variant="secondary"
                    className="font-normal text-emerald-800 bg-emerald-50 border border-emerald-200"
                  >
                    Closing finalized
                  </Badge>
                ) : (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Badge
                            variant="secondary"
                            className="font-normal border border-amber-300 bg-amber-50 text-amber-950"
                          >
                            Closing finalized
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-sm">
                        {finalizedBadgeTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              ) : null}
              {isFinalized && exportPackageLockState != null && !portfolioLoading ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex shrink-0 cursor-default rounded-md p-0.5 text-slate-600 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-slate-400"
                        aria-label={exportLockTooltip}
                      >
                        {exportPackageLockState === "ready" ? (
                          <Lock className="h-4 w-4 text-emerald-600" strokeWidth={2.25} aria-hidden />
                        ) : exportPackageLockState === "pending" ? (
                          <Loader2
                            className="h-4 w-4 animate-spin text-amber-500"
                            strokeWidth={2.25}
                            aria-hidden
                          />
                        ) : exportPackageLockState === "queued" ? (
                          <Lock className="h-4 w-4 text-amber-500" strokeWidth={2.25} aria-hidden />
                        ) : (
                          <Lock
                            className={`h-4 w-4 ${exportPackageLockState === "failed" ? "text-amber-700" : "text-amber-500"}`}
                            strokeWidth={2.25}
                            aria-hidden
                          />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-sm">
                      {exportLockTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            {isFinalized && exportPackageLockState === "failed" ? (
              <p className="mt-1 text-xs font-medium text-amber-900">
                Export package could not be created — closing is still finalized.
              </p>
            ) : null}
            {(agentDisplayName ?? "").trim() ? (
              <p className="text-sm text-slate-600">Agent: {agentDisplayName}</p>
            ) : null}
            {isFinalized ? (
              <p
                className={
                  portfolioLoading
                    ? "text-sm text-slate-600"
                    : exportPackageFullyReady
                      ? "text-sm text-emerald-900/90"
                      : "text-sm text-amber-900/90"
                }
              >
                Financial figures below reflect the locked portfolio snapshot from finalized closing;
                edits on the transaction record no longer change these values.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5 lg:ml-auto">
          <div className="flex flex-wrap items-center justify-end gap-2">
          <TransactionExportPackageHeaderAction
            portfolioSnapshot={portfolioSnapshot}
            latestExport={latestExport}
            exportBusy={finalizeInProgress}
          />
          {onFinalizeClosingClick ? (() => {
            const finalizeButtonDisabled = !!finalizeClosingDisabled || isFinalized;
            // Three-state hover helper, mirroring the Export Package tooltip pattern. Disabled
            // buttons don't fire pointer events, so wrap them in a span when disabled.
            const finalizeTooltipText = isFinalized
              ? "This transaction has been finalized. The export package will remain available when ready."
              : finalizeButtonDisabled
                ? "Finalize Closing becomes available when required documents are complete and review issues are resolved."
                : "Finalize Closing locks the transaction, confirms checklist completion, and prepares the export package.";
            const finalizeButton = (
              <Button
                variant="default"
                size="sm"
                onClick={onFinalizeClosingClick}
                disabled={finalizeButtonDisabled}
                className="min-h-9 min-w-[10.5rem] font-semibold shadow-sm transition-[box-shadow,transform] hover:shadow-md hover:brightness-[1.03] active:scale-[0.98] active:shadow-sm disabled:pointer-events-none disabled:opacity-60 disabled:active:scale-100"
              >
                {finalizeInProgress ? "Finalizing & Creating Export…" : "Finalize Closing"}
              </Button>
            );
            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {finalizeButtonDisabled ? (
                      <span className="inline-flex cursor-help">{finalizeButton}</span>
                    ) : (
                      finalizeButton
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-sm">
                    {finalizeTooltipText}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })() : null}
          <Button variant="outline" size="sm" onClick={onEdit} className="shadow-none">
            Edit Transaction Details
          </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryField label="Client" value={row.clientname || "—"} />
        <SummaryField label="Type" value={row.type || "—"} />
        <SummaryField label="Checklist Type" value={row.checklisttype || "—"} />
        <SummaryField label="Office" value={officeValue} />
        <SummaryField
          label="Commission"
          value={formatUnifiedCommissionPercentDisplay(row)}
        />
        <SummaryField
          label="GCI"
          value={
            isFinalized
              ? formatCurrency(portfolioSnapshot?.revenue_amount)
              : formatCurrency(row.gci)
          }
        />
        <SummaryField
          label="Sale Price"
          value={
            isFinalized
              ? formatCurrency(portfolioSnapshot?.close_price)
              : formatCurrency(row.saleprice)
          }
        />
        {isFinalized ? (
          <SummaryField
            label="Closing Date"
            value={formatPortfolioClosingDate(portfolioSnapshot?.event_date)}
          />
        ) : null}
        {/*
          Intake email lives in the summary grid as a normal field (`lg:col-start-4` keeps it
          pinned to the bottom-right column whether the Closing Date cell is present or not).
          The truncated value gets a native tooltip with the full address; the icon button copies
          the full untruncated email via the page-level `onCopyIntakeEmail` handler.
        */}
        <div className="min-w-0 sm:col-start-2 lg:col-start-4">
          <div className="text-sm text-slate-500">Intake email</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`min-w-0 flex-1 truncate font-mono text-sm leading-snug ${hasIntakeEmail ? "text-slate-900" : "text-slate-400"}`}
              title={hasIntakeEmail ? trimmedIntakeEmail : undefined}
            >
              {hasIntakeEmail ? trimmedIntakeEmail : "—"}
            </span>
            {hasIntakeEmail ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => onCopyIntakeEmail?.(trimmedIntakeEmail)}
                      aria-label="Copy intake email"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Copy intake email
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
