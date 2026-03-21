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
      className={`rounded-lg border p-3 ${
        isReadyToClose
          ? "border-emerald-200 bg-emerald-50/80"
          : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <div className="flex items-start gap-3">
        {isReadyToClose ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transaction Health
            </p>
            <p
              className={`text-sm font-semibold mt-0.5 ${
                isReadyToClose ? "text-emerald-900" : "text-amber-950"
              }`}
            >
              {isReadyToClose ? "Ready to Close" : "Not Ready to Close"}
            </p>
          </div>
          <ul className="text-xs text-slate-700 space-y-1">
            <li>
              <span className="text-slate-600">Required documents missing:</span>{" "}
              <span className="font-medium tabular-nums text-slate-900">{missingRequiredCount}</span>
            </li>
            <li>
              <span className="text-slate-600">Pending review (compliance):</span>{" "}
              <span className="font-medium tabular-nums text-slate-900">{pendingReviewCount}</span>
            </li>
            <li>
              <span className="text-slate-600">Rejected (compliance):</span>{" "}
              <span className="font-medium tabular-nums text-slate-900">{rejectedComplianceCount}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
