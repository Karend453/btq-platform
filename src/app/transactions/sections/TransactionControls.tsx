import { Archive, Download, Activity as ActivityIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  getTransactionClosingReadiness,
  getCloseValidationIssues,
} from "../../../lib/documents/documentEngine";
import { checklistItemForControlsToEngineDocument } from "../../../lib/documents/adapter";
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
}

export interface ArchiveMetadata {
  archivedAt: Date;
  archivedBy: { name: string; role: string } | null;
  archiveReceipt: {
    transactionSummary: {
      identifier: string;
      id: string;
      office: string;
      assignedAgent: string;
      status: string;
    };
    documentSummary: {
      requiredComplete: number;
      requiredWaived: number;
      optionalComplete: number;
      totalDocuments: number;
    };
    activityLogCount: number;
  };
  archivedActivityLog: unknown[];
}

export type TransactionStatus = "Pre-Contract" | "Under Contract" | "Closed" | "Archived";

export type TransactionControlsProps = {
  transactionStatus: TransactionStatus;
  assignedAdmin: string | null;
  closingDate: string | null;
  checklistItems: ChecklistItemForControls[];
  isReadOnly: boolean;
  currentUserRole?: "Admin" | "Agent" | "Broker";
  archiveMetadata: ArchiveMetadata | null;
  onStatusChange: (status: TransactionStatus) => void;
  onClosingDateChange: (date: string) => void;
  onOpenArchiveModal: () => void;
  onDownloadArchivePackage?: () => void;
  onViewArchivedActivityLog?: () => void;
  intakeEmail?: string | null;
  onCopyIntakeEmail?: (text?: string | null) => void;
};

function computeCloseValidation(checklistItems: ChecklistItemForControls[]) {
  const engineDocs = checklistItems.map((item) =>
    checklistItemForControlsToEngineDocument(item)
  );
  const readiness = getTransactionClosingReadiness(engineDocs);
  return getCloseValidationIssues(readiness);
}

function computeArchiveValidation(
  transactionStatus: TransactionStatus,
  checklistItems: ChecklistItemForControls[]
) {
  if (transactionStatus !== "Closed") {
    return { allowed: false, issues: ["Transaction must be Closed before archiving"] };
  }
  const closeCheck = computeCloseValidation(checklistItems);
  if (!closeCheck.allowed) {
    return {
      allowed: false,
      issues: ["All required documents must be complete", ...closeCheck.issues],
    };
  }
  return { allowed: true, issues: [] };
}

export default function TransactionControls({
  transactionStatus,
  assignedAdmin: _assignedAdmin,
  closingDate,
  checklistItems,
  isReadOnly,
  currentUserRole = "Admin",
  archiveMetadata,
  onStatusChange,
  onClosingDateChange,
  onOpenArchiveModal,
  onDownloadArchivePackage,
  onViewArchivedActivityLog,
  intakeEmail,
  onCopyIntakeEmail,
}: TransactionControlsProps) {
  const closeValidation = computeCloseValidation(checklistItems);
  const archiveValidation = computeArchiveValidation(transactionStatus, checklistItems);
  const showReadiness =
    !isReadOnly && transactionStatus !== "Closed" && transactionStatus !== "Archived";

  return (
    <>
      {/* Transaction + closing readiness (single purpose) */}
      <Card className="gap-3 border-slate-200 shadow-sm">
        <CardHeader className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-slate-900">Transaction</CardTitle>
            {(currentUserRole === "Admin" || currentUserRole === "Broker") && !isReadOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenArchiveModal}
                        disabled={!archiveValidation.allowed}
                        className="text-slate-700 border-slate-300"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive Transaction
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!archiveValidation.allowed && (
                    <TooltipContent>
                      <div className="text-sm max-w-xs">
                        <p className="font-medium mb-1">Cannot archive:</p>
                        <ul className="space-y-0.5">
                          {archiveValidation.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <div className="space-y-2.5">
            {showReadiness && <TransactionHealth checklistItems={checklistItems} />}

            <div
              className={
                showReadiness ? "space-y-3 border-t border-slate-100 pt-2.5" : "space-y-4"
              }
            >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:items-end">
              {/* Status Dropdown */}
              <div>
                <Label
                  htmlFor="transaction-status"
                  className="mb-1 block text-xs font-medium text-slate-500"
                >
                  Status
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
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
                            <SelectItem
                              value="Closed"
                              disabled={!closeValidation.allowed}
                            >
                              Closed {!closeValidation.allowed && "🔒"}
                            </SelectItem>
                            <SelectItem value="Archived" disabled>
                              Archived (use Archive button)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TooltipTrigger>
                    {!closeValidation.allowed && transactionStatus !== "Closed" && (
                      <TooltipContent side="right">
                        <p className="text-sm">
                          Resolve required document issues before closing
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Closing Date */}
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
      </Card>

      {/* Archive Receipt Section (visible when archived) */}
      {isReadOnly && archiveMetadata?.archivedAt && archiveMetadata?.archiveReceipt && (
        <Card className="border-blue-200 bg-blue-50/90 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Archive className="h-5 w-5 text-blue-700" />
              Archive Receipt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-slate-700">
                <p className="mb-1">
                  <span className="font-medium">Archived on:</span>{" "}
                  {archiveMetadata.archivedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p>
                  <span className="font-medium">By:</span>{" "}
                  {archiveMetadata.archivedBy?.name} ({archiveMetadata.archivedBy?.role})
                </p>
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Transaction Summary</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-600">Transaction:</span>
                    <p className="text-xs text-slate-900">
                      {archiveMetadata.archiveReceipt.transactionSummary.identifier}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">ID:</span>
                    <p className="text-xs text-slate-900">
                      {archiveMetadata.archiveReceipt.transactionSummary.id}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">Office:</span>
                    <p className="text-xs text-slate-900">
                      {archiveMetadata.archiveReceipt.transactionSummary.office}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">Agent:</span>
                    <p className="text-xs text-slate-900">
                      {archiveMetadata.archiveReceipt.transactionSummary.assignedAgent}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h4 className="mb-3 text-sm font-semibold text-slate-900">Document Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600">Required (Complete):</span>
                      <span className="font-medium text-slate-900">
                        {archiveMetadata.archiveReceipt.documentSummary.requiredComplete}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600">Required (Waived):</span>
                      <span className="font-medium text-slate-900">
                        {archiveMetadata.archiveReceipt.documentSummary.requiredWaived}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600">Optional (Complete):</span>
                      <span className="font-medium text-slate-900">
                        {archiveMetadata.archiveReceipt.documentSummary.optionalComplete}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600">Total:</span>
                      <span className="font-medium text-slate-900">
                        {archiveMetadata.archiveReceipt.documentSummary.totalDocuments}
                      </span>
                    </div>
                    <div className="col-span-2 flex justify-between border-t border-slate-100 pt-3">
                      <span className="text-slate-600">Activity Log Entries:</span>
                      <span className="font-medium text-slate-900">
                        {archiveMetadata.archiveReceipt.activityLogCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {onDownloadArchivePackage && (
                  <Button variant="outline" size="sm" onClick={onDownloadArchivePackage}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Archive Package
                  </Button>
                )}
                {onViewArchivedActivityLog && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onViewArchivedActivityLog();
                      toast.info(
                        "Viewing archived activity log with " +
                          archiveMetadata.archivedActivityLog.length +
                          " entries"
                      );
                    }}
                  >
                    <ActivityIcon className="h-4 w-4 mr-2" />
                    View Archived Activity Log
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
