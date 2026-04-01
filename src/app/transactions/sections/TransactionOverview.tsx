import React, { useState } from "react";
import {
  Building2,
  ChevronDown,
  FileText,
  LayoutGrid,
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
import type { TransactionRow } from "../../../services/transactions";
import type { ClientPortfolioForTransactionSnapshot } from "../../../services/clientPortfolio";
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
    launchUrl: "https://app.skyslope.com/",
    showEmail: true,
  },
  lofty: {
    label: "Lofty",
    launchUrl: "https://lofty.com/",
    showEmail: false,
  },
};

/** Compact list/buyer commission % for summary: `3% / 3%`, one side, or — */
function formatCommissionPercentSummary(
  row: Pick<TransactionRow, "listcommissionpercent" | "buyercommissionpercent">
): string {
  const list = (row.listcommissionpercent ?? "").trim();
  const buyer = (row.buyercommissionpercent ?? "").trim();
  const withPct = (s: string) => (s.endsWith("%") ? s : `${s}%`);
  if (!list && !buyer) return "—";
  if (list && buyer) return `${withPct(list)} / ${withPct(buyer)}`;
  if (list) return withPct(list);
  return withPct(buyer);
}

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
  onFinalizeClosingClick?: () => void;
  finalizeClosingDisabled?: boolean;
};

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
  onFinalizeClosingClick,
  finalizeClosingDisabled,
}: TransactionOverviewSectionProps) {
  const portfolioStage = portfolioSnapshot?.portfolio_stage;
  const isFinalized = portfolioStage === "final";
  const portfolioLoading = portfolioSnapshot === undefined;
  const intakeEmail = row.intake_email ?? "";

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
                <Badge
                  variant="secondary"
                  className="font-normal text-emerald-800 bg-emerald-50 border border-emerald-200"
                >
                  Closing finalized
                </Badge>
              ) : null}
            </div>
            {(agentDisplayName ?? "").trim() ? (
              <p className="text-sm text-slate-600">Agent: {agentDisplayName}</p>
            ) : null}
            <p className="text-sm text-slate-500">
              Summary — edit details to complete reporting & financial data
            </p>
            {isFinalized ? (
              <p className="text-sm text-emerald-900/90">
                Financial figures below reflect the locked portfolio snapshot from finalized closing;
                edits on the transaction record no longer change these values.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
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
              variant="secondary"
              size="sm"
              onClick={onFinalizeClosingClick}
              disabled={!!finalizeClosingDisabled || portfolioLoading || isFinalized}
            >
              Finalize Closing
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEdit} className="shadow-none">
            Edit Transaction Details
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryField label="Client" value={row.clientname || "—"} />
        <SummaryField label="Type" value={row.type || "—"} />
        <SummaryField label="Checklist Type" value={row.checklisttype || "—"} />
        <SummaryField label="Office" value={officeValue} />
        <SummaryField
          label="Commission"
          value={formatCommissionPercentSummary(row)}
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
