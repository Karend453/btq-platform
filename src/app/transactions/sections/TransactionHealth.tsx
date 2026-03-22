import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getTransactionHealthSectionMetrics } from "../../../lib/documents/documentEngine";
import { checklistItemForControlsToEngineDocument } from "../../../lib/documents/adapter";
import type { ChecklistItemForControlsShape } from "../../../lib/documents/adapter";

type TransactionHealthProps = {
  checklistItems: ChecklistItemForControlsShape[];
};

export default function TransactionHealth({ checklistItems }: TransactionHealthProps) {
  const engineDocs = checklistItems.map((item) =>
    checklistItemForControlsToEngineDocument(item)
  );
  const { isReadyToClose, missingRequiredCount, pendingReviewCount, rejectedComplianceCount } =
    getTransactionHealthSectionMetrics(engineDocs);

  return (
    <div
      className={`rounded-lg border px-2.5 py-2 sm:px-3 sm:py-2 ${
        isReadyToClose
          ? "border-emerald-200 bg-emerald-50/80"
          : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {isReadyToClose ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-700" />
          )}
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Transaction Health
            </p>
            <p
              className={`mt-0.5 text-sm font-semibold tracking-tight ${
                isReadyToClose ? "text-emerald-950" : "text-slate-900"
              }`}
            >
              {isReadyToClose ? "Ready to Close" : "Not Ready to Close"}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:max-w-md lg:max-w-lg">
          <div className="rounded border border-slate-200/90 bg-white/70 px-1.5 py-1">
            <p className="text-[10px] leading-tight text-slate-600">Required missing</p>
            <p className="mt-px text-xs font-semibold tabular-nums leading-none text-slate-900">
              {missingRequiredCount}
            </p>
          </div>
          <div className="rounded border border-slate-200/90 bg-white/70 px-1.5 py-1">
            <p className="text-[10px] leading-tight text-slate-600">Pending review</p>
            <p className="mt-px text-xs font-semibold tabular-nums leading-none text-slate-900">
              {pendingReviewCount}
            </p>
          </div>
          <div className="rounded border border-slate-200/90 bg-white/70 px-1.5 py-1">
            <p className="text-[10px] leading-tight text-slate-600">Rejected</p>
            <p className="mt-px text-xs font-semibold tabular-nums leading-none text-slate-900">
              {rejectedComplianceCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
