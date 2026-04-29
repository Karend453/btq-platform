import React, { useMemo } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
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
  /**
   * Slot for the compact Document Inbox row (count + Upload + Open inbox). Rendered in the
   * Transaction card header — always visible whether the card is collapsed or expanded.
   */
  documentInboxActions?: React.ReactNode;
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
  documentInboxActions,
}: TransactionControlsProps) {
  const activeChecklistItems = useMemo(
    () => checklistItems.filter((i) => !i.archivedAt),
    [checklistItems]
  );
  const showReadiness =
    !isReadOnly && transactionStatus !== "Closed" && transactionStatus !== "Archived";

  const statusIsFinalizedDisplay = transactionStatus === "Archived";

  return (
    <Collapsible defaultOpen>
      <Card className="gap-0 overflow-hidden rounded-lg border-slate-200 shadow-sm">
        {/*
          Header is now a flex row (not a single big trigger) so we can host the Document Inbox
          actions alongside the title without nesting buttons. The chevron is the only piece that
          toggles the collapsible.
        */}
        <CardHeader className="space-y-0 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
            <span className="inline-flex shrink-0 items-center gap-2 text-base font-semibold leading-none text-slate-900">
              <ClipboardList className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Transaction
            </span>
            {documentInboxActions ? (
              <>
                <span className="hidden text-slate-300 sm:inline" aria-hidden>
                  ·
                </span>
                <div className="min-w-0 flex-1">{documentInboxActions}</div>
              </>
            ) : (
              <div className="flex-1" />
            )}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md outline-none",
                  "text-slate-500 transition-colors hover:bg-slate-100/80",
                  "focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-2",
                  "data-[state=open]:[&>svg]:rotate-180"
                )}
                aria-label="Toggle Transaction section"
              >
                <ChevronDown className="h-4 w-4 transition-transform duration-200" aria-hidden />
              </button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
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
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
