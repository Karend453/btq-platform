import {
  AlertTriangle,
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Activity as ActivityIcon,
} from "lucide-react";
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

export interface ChecklistItemForControls {
  id: string;
  requirement: "required" | "optional";
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
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
  contractDate: string | null;
  checklistItems: ChecklistItemForControls[];
  isReadOnly: boolean;
  currentUserRole?: "Admin" | "Agent";
  archiveMetadata: ArchiveMetadata | null;
  onStatusChange: (status: TransactionStatus) => void;
  onAssignedAdminChange: (admin: string) => void;
  onClosingDateChange: (date: string) => void;
  onContractDateChange: (date: string) => void;
  onOpenArchiveModal: () => void;
  onDownloadArchivePackage?: () => void;
  onViewArchivedActivityLog?: () => void;
};

function computeNeedsAttention(
  checklistItems: ChecklistItemForControls[],
  closingDate: string | null
): boolean {
  const now = new Date();
  const closingDateObj = closingDate ? new Date(closingDate) : null;
  const daysUntilClosing = closingDateObj
    ? Math.ceil((closingDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const hasRejectedRequired = checklistItems.some(
    (item) => item.requirement === "required" && item.reviewStatus === "rejected"
  );

  const hasStalePendingRequired = checklistItems.some((item) => {
    if (item.requirement !== "required" || item.reviewStatus !== "pending") return false;
    if (item.attachedDocument?.updatedAt) {
      const hoursSinceUpdate =
        (now.getTime() - item.attachedDocument.updatedAt.getTime()) / (1000 * 60 * 60);
      return hoursSinceUpdate > 48;
    }
    return false;
  });

  const hasIncompleteNearClosing =
    daysUntilClosing !== null &&
    daysUntilClosing <= 7 &&
    daysUntilClosing >= 0 &&
    checklistItems.some(
      (item) =>
        item.requirement === "required" &&
        item.reviewStatus !== "complete" &&
        item.reviewStatus !== "waived"
    );

  return hasRejectedRequired || hasStalePendingRequired || hasIncompleteNearClosing;
}

function computeCloseValidation(checklistItems: ChecklistItemForControls[]) {
  const requiredItems = checklistItems.filter((item) => item.requirement === "required");
  const issues: string[] = [];

  const missingAttachments = requiredItems.filter((item) => !item.attachedDocument);
  if (missingAttachments.length > 0) {
    issues.push(
      `${missingAttachments.length} required document${missingAttachments.length > 1 ? "s" : ""} need${missingAttachments.length === 1 ? "s" : ""} attachment`
    );
  }

  const rejectedItems = requiredItems.filter((item) => item.reviewStatus === "rejected");
  if (rejectedItems.length > 0) {
    issues.push(
      `${rejectedItems.length} required document${rejectedItems.length > 1 ? "s are" : " is"} rejected`
    );
  }

  const pendingItems = requiredItems.filter(
    (item) => item.attachedDocument && item.reviewStatus === "pending"
  );
  if (pendingItems.length > 0) {
    issues.push(
      `${pendingItems.length} required document${pendingItems.length > 1 ? "s are" : " is"} pending review`
    );
  }

  return { allowed: issues.length === 0, issues };
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
  assignedAdmin,
  closingDate,
  contractDate,
  checklistItems,
  isReadOnly,
  currentUserRole = "Admin",
  archiveMetadata,
  onStatusChange,
  onAssignedAdminChange,
  onClosingDateChange,
  onContractDateChange,
  onOpenArchiveModal,
  onDownloadArchivePackage,
  onViewArchivedActivityLog,
}: TransactionControlsProps) {
  const needsAttention = computeNeedsAttention(checklistItems, closingDate);
  const closeValidation = computeCloseValidation(checklistItems);
  const archiveValidation = computeArchiveValidation(transactionStatus, checklistItems);

  return (
    <>
      {/* Needs Attention Banner */}
      {needsAttention && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900 mb-1">Action Required</h3>
                <p className="text-sm text-red-700">
                  This transaction requires attention. Check for rejected documents, stale pending
                  items, or incomplete requirements near closing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Operational Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Transaction Controls</CardTitle>
            {currentUserRole === "Admin" && !isReadOnly && (
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
        <CardContent>
          <div className="space-y-4">
            {/* Ready to Close Indicator */}
            {!isReadOnly &&
              transactionStatus !== "Closed" &&
              transactionStatus !== "Archived" && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  {closeValidation.allowed ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-900">Ready to Close</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          All required documents are complete
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Not Ready to Close</p>
                        <ul className="text-xs text-slate-600 mt-1 space-y-0.5">
                          {closeValidation.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Dropdown */}
              <div>
                <Label
                  htmlFor="transaction-status"
                  className="text-sm font-medium text-slate-700 mb-1.5 block"
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

              {/* Assigned Admin Dropdown */}
              <div>
                <Label
                  htmlFor="assigned-admin"
                  className="text-sm font-medium text-slate-700 mb-1.5 block"
                >
                  Assigned Admin
                </Label>
                <Select
                  value={assignedAdmin ?? ""}
                  onValueChange={onAssignedAdminChange}
                  disabled={isReadOnly}
                >
                  <SelectTrigger id="assigned-admin">
                    <SelectValue placeholder="Select admin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Karen Admin">Karen Admin</SelectItem>
                    <SelectItem value="Tina Review">Tina Review</SelectItem>
                    <SelectItem value="Jordan Ops">Jordan Ops</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contract Date */}
              <div>
                <Label
                  htmlFor="contract-date"
                  className="text-sm font-medium text-slate-700 mb-1.5 block"
                >
                  Contract Date
                </Label>
                <Input
                  id="contract-date"
                  type="date"
                  value={contractDate ?? ""}
                  onChange={(e) => onContractDateChange(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>

              {/* Closing Date */}
              <div>
                <Label
                  htmlFor="closing-date"
                  className="text-sm font-medium text-slate-700 mb-1.5 block"
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
        </CardContent>
      </Card>

      {/* Archive Receipt Section (visible when archived) */}
      {isReadOnly && archiveMetadata?.archivedAt && archiveMetadata?.archiveReceipt && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
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

              <div className="bg-white border border-blue-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Transaction Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-600">Transaction:</span>
                    <p className="text-slate-900 text-xs">
                      {archiveMetadata.archiveReceipt.transactionSummary.identifier}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">ID:</span>
                    <p className="text-slate-900 text-xs">
                      {archiveMetadata.archiveReceipt.transactionSummary.id}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">Office:</span>
                    <p className="text-slate-900 text-xs">
                      {archiveMetadata.archiveReceipt.transactionSummary.office}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-600">Agent:</span>
                    <p className="text-slate-900 text-xs">
                      {archiveMetadata.archiveReceipt.transactionSummary.assignedAgent}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-blue-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Document Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Required (Complete):</span>
                    <span className="text-slate-900 font-medium">
                      {archiveMetadata.archiveReceipt.documentSummary.requiredComplete}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Required (Waived):</span>
                    <span className="text-slate-900 font-medium">
                      {archiveMetadata.archiveReceipt.documentSummary.requiredWaived}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Optional (Complete):</span>
                    <span className="text-slate-900 font-medium">
                      {archiveMetadata.archiveReceipt.documentSummary.optionalComplete}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total:</span>
                    <span className="text-slate-900 font-medium">
                      {archiveMetadata.archiveReceipt.documentSummary.totalDocuments}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-between pt-2 border-t border-blue-200">
                    <span className="text-slate-600">Activity Log Entries:</span>
                    <span className="text-slate-900 font-medium">
                      {archiveMetadata.archiveReceipt.activityLogCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
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
