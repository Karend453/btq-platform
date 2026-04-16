import React, { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  FileText,
  LayoutGrid,
  Loader2,
  Lock,
  SquarePen,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog";
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
import { ExternalToolPanelContent } from "./ExternalToolPanel";

export type ActiveExternalTool = "zipforms" | "dotloop" | "skyslope" | "lofty";

const TOOL_CONFIG: Record<
  ActiveExternalTool,
  { label: string; launchUrl: string; showEmail: boolean }
> = {
  zipforms: {
    label: "ZipForms",
    launchUrl: "https://www.zipformplus.com/",
    showEmail: true,
  },
  dotloop: {
    label: "Dotloop",
    launchUrl: "https://www.dotloop.com/",
    showEmail: true,
  },
  skyslope: {
    label: "SkySlope",
    launchUrl: "https://skyslope.com/forms-login/",
    showEmail: true,
  },
  lofty: {
    label: "Lofty",
    launchUrl: "https://lofty.com/",
    showEmail: false,
  },
};

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
  /** True while finalize RPC is running (spinner on export lock). */
  exportGenerationBusy?: boolean;
  /** True while Finalize modal submit is running (primary button loading label). */
  finalizeInProgress?: boolean;
  onFinalizeClosingClick?: () => void;
  finalizeClosingDisabled?: boolean;
  /** Inbox documents not linked to any checklist row — must be resolved before finalizing. */
  unattachedInboxDocumentCount?: number;
};

type ExportPackageLockState = "ready" | "pending" | "failed" | "unknown";

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
  exportGenerationBusy = false,
  finalizeInProgress = false,
  onFinalizeClosingClick,
  finalizeClosingDisabled,
  unattachedInboxDocumentCount = 0,
}: TransactionOverviewSectionProps) {
  const portfolioStage = portfolioSnapshot?.portfolio_stage;
  const isFinalized = portfolioStage === "final";
  const portfolioLoading = portfolioSnapshot === undefined;
  const intakeEmail = row.intake_email ?? "";

  const exportPackageLockState = useMemo((): ExportPackageLockState | null => {
    if (!isFinalized || portfolioLoading) return null;

    const legacySt = portfolioSnapshot?.export_status?.trim().toLowerCase();
    const legacyPath = (portfolioSnapshot?.export_storage_path ?? "").trim();

    if (latestExport === undefined) {
      if (legacySt === "failed") return "failed";
      if (legacySt === "ready" && legacyPath) return "ready";
      if (exportGenerationBusy || legacySt === "pending") return "pending";
      return "unknown";
    }

    if (latestExport !== null) {
      const st = latestExport.status;
      const path = (latestExport.zip_storage_path ?? "").trim();
      if (st === "failed") return "failed";
      if (st === "ready" && path) return "ready";
      if (st === "queued" || st === "processing" || exportGenerationBusy) return "pending";
      return "unknown";
    }

    if (legacySt === "failed") return "failed";
    if (legacySt === "ready" && legacyPath) return "ready";
    if (exportGenerationBusy || legacySt === "pending") return "pending";
    return "unknown";
  }, [isFinalized, portfolioLoading, portfolioSnapshot, exportGenerationBusy, latestExport]);

  const exportPackageFullyReady = exportPackageLockState === "ready";

  const exportLockTooltip = useMemo(() => {
    if (exportPackageLockState === "ready") return "Export package ready";
    if (exportPackageLockState === "failed") return "Export package failed";
    if (exportPackageLockState === "pending") {
      if (latestExport?.status === "queued") return "Export package queued";
      if (latestExport?.status === "processing") return "Export package creating";
      return "Export package is being created";
    }
    return "Transaction is finalized, but the export package is not ready yet.";
  }, [exportPackageLockState, latestExport?.status]);

  const finalizedBadgeTooltip = useMemo(() => {
    if (exportPackageLockState === "pending") {
      if (latestExport?.status === "queued") return "Export package queued";
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

  const [activeTool, setActiveTool] = useState<ActiveExternalTool | null>(null);
  const [formsMenuOpen, setFormsMenuOpen] = useState(false);

  const selectTool = (tool: ActiveExternalTool) => {
    setActiveTool(tool);
    setFormsMenuOpen(false);
  };

  const activeConfig = activeTool ? TOOL_CONFIG[activeTool] : null;

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
                Export package could not be created — closing is still finalized. See Export Package
                below.
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
          <DropdownMenu open={formsMenuOpen} onOpenChange={setFormsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="min-w-[10.5rem] justify-between gap-2 shadow-none"
                aria-expanded={formsMenuOpen}
              >
                <span>Forms & E-Sign</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[240px] min-w-[220px] max-w-[260px] border-slate-200/90 p-2 shadow-md"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-slate-500">
                  Forms Providers
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 rounded-md px-2 py-2 font-normal text-slate-800 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
                  onSelect={(e) => {
                    e.preventDefault();
                    selectTool("zipforms");
                  }}
                >
                  <FileText
                    className="h-4 w-4 shrink-0 text-slate-500"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  ZipForms
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 rounded-md px-2 py-2 font-normal text-slate-800 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
                  onSelect={(e) => {
                    e.preventDefault();
                    selectTool("dotloop");
                  }}
                >
                  <SquarePen
                    className="h-4 w-4 shrink-0 text-slate-500"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  Dotloop
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 rounded-md px-2 py-2 font-normal text-slate-800 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
                  onSelect={(e) => {
                    e.preventDefault();
                    selectTool("skyslope");
                  }}
                >
                  <Building2
                    className="h-4 w-4 shrink-0 text-slate-500"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  SkySlope
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="my-1.5 bg-slate-200/80" />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-slate-500">
                  CRM
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 rounded-md px-2 py-2 font-normal text-slate-800 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
                  onSelect={(e) => {
                    e.preventDefault();
                    selectTool("lofty");
                  }}
                >
                  <LayoutGrid
                    className="h-4 w-4 shrink-0 text-slate-500"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  Lofty
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog
            open={activeTool !== null}
            onOpenChange={(open) => {
              if (!open) setActiveTool(null);
            }}
          >
            <DialogContent
              className="top-[44%] max-h-[min(90vh,520px)] w-full max-w-[360px] gap-0 overflow-y-auto border-slate-200/90 bg-white p-4 pr-12 pt-5 shadow-md sm:max-w-[360px]"
            >
              {activeConfig ? (
                <>
                  <DialogTitle className="sr-only">{activeConfig.label}</DialogTitle>
                  <ExternalToolPanelContent
                    key={activeTool ?? undefined}
                    toolName={activeConfig.label}
                    launchUrl={activeConfig.launchUrl}
                    intakeEmail={intakeEmail}
                    showEmail={activeConfig.showEmail}
                  />
                </>
              ) : null}
            </DialogContent>
          </Dialog>
          {onFinalizeClosingClick ? (
            <Button
              variant="default"
              size="sm"
              onClick={onFinalizeClosingClick}
              disabled={!!finalizeClosingDisabled || isFinalized}
              title={
                !isFinalized && unattachedInboxDocumentCount > 0
                  ? `Finalize is disabled: ${unattachedInboxDocumentCount} inbox-only document(s) must be attached to the checklist or permanently removed from the inbox.`
                  : undefined
              }
              className="min-h-9 min-w-[10.5rem] font-semibold shadow-sm transition-[box-shadow,transform] hover:shadow-md hover:brightness-[1.03] active:scale-[0.98] active:shadow-sm disabled:pointer-events-none disabled:opacity-60 disabled:active:scale-100"
            >
              {finalizeInProgress ? "Finalizing & Creating Export…" : "Finalize Closing"}
            </Button>
          ) : null}
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
      </div>
    </div>
  );
}
