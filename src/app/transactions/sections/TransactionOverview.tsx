import React from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import type { TransactionRow } from "../../../services/transactions";
import type { ClientPortfolioForTransactionSnapshot } from "../../../services/clientPortfolio";

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
  onOpenZipFormsLaunch: () => void;
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
  onOpenZipFormsLaunch,
  onEdit,
  portfolioSnapshot,
  onFinalizeClosingClick,
  finalizeClosingDisabled,
}: TransactionOverviewSectionProps) {
  const portfolioStage = portfolioSnapshot?.portfolio_stage;
  const isFinalized = portfolioStage === "final";
  const portfolioLoading = portfolioSnapshot === undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={onSave}>
            Save
          </Button>
          <Button size="sm" onClick={onOpenZipFormsLaunch}>
            Launch ZipForms
          </Button>
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
          <Button variant="outline" size="sm" onClick={onEdit}>
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
