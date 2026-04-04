import React, { useMemo } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { cn } from "../../components/ui/utils";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import TransactionHealth from "./TransactionHealth";

export interface ChecklistItemForControls {
  id: string;
  requirement: "required" | "optional";
  isComplianceDocument?: boolean;
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  /** Persisted link — engine uses when `attachedDocument` is not merged from inbox. */
  documentId?: string | null;
  attachedDocument?: {
    updatedAt: Date;
  };
  /** When set, item is excluded from readiness and health (aligned with checklist archive). */
  archivedAt?: string | null;
}

export type TransactionStatus = "Pre-Contract" | "Under Contract" | "Closed" | "Archived";

export type TransactionControlsProps = {
  transactionStatus: TransactionStatus;
  assignedAdmin: string | null;
  closingDate: string | null;
  checklistItems: ChecklistItemForControls[];
  isReadOnly: boolean;
  currentUserRole?: "Admin" | "Agent" | "Broker";
  onStatusChange: (status: TransactionStatus) => void;
  onClosingDateChange: (date: string) => void;
  intakeEmail?: string | null;
  onCopyIntakeEmail?: (text?: string | null) => void;
};

export default function TransactionControls({
  transactionStatus,
  assignedAdmin: _assignedAdmin,
  closingDate,
  checklistItems,
  isReadOnly,
  currentUserRole: _currentUserRole = "Admin",
  onStatusChange,
  onClosingDateChange,
  intakeEmail,
  onCopyIntakeEmail,
}: TransactionControlsProps) {
  const activeChecklistItems = useMemo(
    () => checklistItems.filter((i) => !i.archivedAt),
    [checklistItems]
  );
  const showReadiness =
    !isReadOnly && transactionStatus !== "Closed" && transactionStatus !== "Archived";

  const statusIsFinalizedDisplay = transactionStatus === "Archived";

  return (
    <>
      <Collapsible defaultOpen>
        <Card className="gap-0 overflow-hidden rounded-lg border-slate-200 shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full min-h-10 items-center gap-2 px-3 py-2 text-left outline-none",
                "transition-colors hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-2",
                "data-[state=open]:[&>svg:last-child]:rotate-180"
              )}
              aria-label="Toggle Transaction section"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 text-base font-semibold leading-none text-slate-900">
                Transaction
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200"
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden">
            <CardContent className="px-4 pb-3 pt-0">
              <div className="space-y-2.5">
                {showReadiness && <TransactionHealth checklistItems={activeChecklistItems} />}

                <div
                  className={
                    showReadiness ? "space-y-3 border-t border-slate-100 pt-2.5" : "space-y-4"
                  }
                >
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:items-end">
                <div>
                  <Label
                    htmlFor="transaction-status"
                    className="mb-1 block text-xs font-medium text-slate-500"
                  >
                    Status
                  </Label>
                  {statusIsFinalizedDisplay ? (
                    <div
                      id="transaction-status"
                      className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900"
                    >
                      Finalized
                    </div>
                  ) : (
                    <Select
                      value={transactionStatus}
                      onValueChange={(v) => onStatusChange(v as TransactionStatus)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger id="transaction-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pre-Contract">Pre-Contract</SelectItem>
                        <SelectItem value="Under Contract">Under Contract</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label
                    htmlFor="closing-date"
                    className="mb-1 block text-xs font-medium text-slate-500"
                  >
                    Closing Date
                  </Label>
                  <Input
                    id="closing-date"
                    type="date"
                    value={closingDate ?? ""}
                    onChange={(e) => onClosingDateChange(e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="pb-0">
                <Label
                  htmlFor="intake-email-display"
                  className="mb-1 block text-xs font-medium text-slate-500"
                >
                  Intake email
                </Label>
                <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                  <Input
                    id="intake-email-display"
                    readOnly
                    value={intakeEmail?.trim() ?? ""}
                    placeholder="—"
                    className="h-9 min-h-0 flex-1 min-w-0 bg-slate-50/80 font-mono text-sm"
                    tabIndex={-1}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    disabled={!intakeEmail?.trim()}
                    onClick={() => onCopyIntakeEmail?.(intakeEmail)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </>
  );
}
