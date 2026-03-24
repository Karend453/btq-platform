import React from "react";
import { Button } from "../../components/ui/button";
import type { TransactionRow } from "../../../services/transactions";

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
  onLaunchZipForms: () => void;
  onEdit: () => void;
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
  onLaunchZipForms,
  onEdit,
}: TransactionOverviewSectionProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {(agentDisplayName ?? "").trim() ? (
            <p className="text-sm text-slate-600">Agent: {agentDisplayName}</p>
          ) : null}
          <p className="text-sm text-slate-500">
            Summary — edit details to complete reporting & financial data
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={onSave}>
            Save
          </Button>
          <Button size="sm" onClick={onLaunchZipForms}>
            Launch ZipForms
          </Button>
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
        <SummaryField label="GCI" value={formatCurrency(row.gci)} />
        <SummaryField label="Sale Price" value={formatCurrency(row.saleprice)} />
      </div>
    </div>
  );
}
