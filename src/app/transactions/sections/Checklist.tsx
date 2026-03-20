import React from "react";
import {
  FileText,
  Paperclip,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Link,
  MessageSquare,
  Eye,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";
import type { ChecklistItem, InboxDocument } from "./TransactionInbox";
import type { ChecklistTemplate } from "../../../services/checklistTemplates";
import { getSignedUrl, attachDocumentToChecklistItem } from "../../../services/transactionDocuments";

function formatRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  } else {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }
}

function getChecklistIcon(reviewStatus: string) {
  switch (reviewStatus) {
    case "complete":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "rejected":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "waived":
      return <XCircle className="h-5 w-5 text-slate-400" />;
    case "pending":
    default:
      return <Clock className="h-5 w-5 text-amber-600" />;
  }
}

function getRequirementBadge(requirement: string) {
  return requirement === "required" ? (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
      Required
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
      Optional
    </Badge>
  );
}

function getReviewStatusBadge(reviewStatus: string) {
  switch (reviewStatus) {
    case "complete":
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">
          Complete
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 border">
          Rejected
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 border">
          Pending Review
        </Badge>
      );
    case "waived":
      return (
        <Badge className="bg-slate-50 text-slate-700 border-slate-300 border">
          Waived / Not Required
        </Badge>
      );
    default:
      return null;
  }
}

function hasUnreadComments(
  item: ChecklistItem,
  currentUserRole: "Admin" | "Agent"
): boolean {
  const comments = item.comments as Array<{
    type?: string;
    visibility?: string;
    unread?: { Admin?: boolean; Agent?: boolean };
  }>;
  return comments.some((comment) => {
    const isVisible =
      currentUserRole === "Admin" ||
      (currentUserRole === "Agent" && comment.visibility === "Shared");
    return isVisible && comment.unread?.[currentUserRole] === true;
  });
}

export type ChecklistProps = {
  checklistTemplateId: string | null;
  checklistTemplates: ChecklistTemplate[];
  isLoadingTemplates?: boolean;
  isSavingChecklist?: boolean;
  onChecklistTemplateSelect: (templateId: string) => void;
  checklistItems: ChecklistItem[];
  onChecklistItemsChange: (items: ChecklistItem[]) => void;
  inboxDocuments: InboxDocument[];
  onInboxDocumentsChange: (docs: InboxDocument[]) => void;
  currentUserRole?: "Admin" | "Agent";
  isReadOnly?: boolean;
  addActivityEntry?: (entry: {
    actor: "System" | "Agent" | "Admin";
    category: "docs" | "forms" | "system";
    type: string;
    message: string;
    meta?: Record<string, unknown>;
  }) => void;
  onOpenAttachDrawer?: (item?: ChecklistItem) => void;
  onOpenComments?: (item: ChecklistItem) => void;
  onOpenReviewModal?: (item: ChecklistItem) => void;
};

export default function Checklist({
  checklistTemplateId,
  checklistTemplates,
  isLoadingTemplates = false,
  isSavingChecklist = false,
  onChecklistTemplateSelect,
  checklistItems,
  onChecklistItemsChange,
  inboxDocuments,
  onInboxDocumentsChange,
  currentUserRole = "Admin",
  isReadOnly = false,
  addActivityEntry,
  onOpenAttachDrawer,
  onOpenComments,
  onOpenReviewModal,
}: ChecklistProps) {
  const completedCount = checklistItems.filter(
    (item) => item.reviewStatus === "complete"
  ).length;
  const totalCount = checklistItems.length;

  const handleAttachSuggested = async (item: ChecklistItem) => {
    if (!item.suggestedDocument) return;

    const inboxDoc = inboxDocuments.find((doc) => doc.id === item.suggestedDocument?.id);
    if (!inboxDoc) return;

    const isReplacement = !!item.attachedDocument;
    const previousVersion = item.attachedDocument?.version;
    const newVersion = isReplacement ? item.attachedDocument!.version + 1 : 1;
    const previousStatus = item.reviewStatus;
    const previousDocId = item.attachedDocument?.id;

    // Persist to DB first
    const attached = await attachDocumentToChecklistItem(inboxDoc.id, item.id);
    if (!attached) {
      toast.error("Failed to save attachment");
      return;
    }
    if (isReplacement && previousDocId) {
      await attachDocumentToChecklistItem(previousDocId, null);
    }

    let newReviewStatus = item.reviewStatus;
    let statusAutoReset = false;

    if (!isReplacement) {
      newReviewStatus = "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      newReviewStatus = "pending";
      statusAutoReset = true;
    }

    onChecklistItemsChange(
      checklistItems.map((i) =>
        i.id === item.id
          ? {
              ...i,
              attachedDocument: {
                id: inboxDoc.id,
                filename: inboxDoc.filename,
                storage_path: inboxDoc.storage_path,
                version: newVersion,
                updatedAt: new Date(),
                previousVersion: isReplacement ? previousVersion : undefined,
              },
              reviewStatus: newReviewStatus,
              suggestedDocument: undefined,
              updatedAt: "Just now",
            }
          : i
      )
    );

    onInboxDocumentsChange(
      inboxDocuments.map((doc) =>
        doc.id === inboxDoc.id
          ? { ...doc, isAttached: true, attachedToItemId: item.id }
          : doc
      )
    );

    if (addActivityEntry) {
      if (isReplacement) {
        addActivityEntry({
          actor: currentUserRole,
          category: "docs",
          type: "DOC_REPLACED",
          message: `${currentUserRole} replaced document on "${item.name}" (v${previousVersion} → v${newVersion})`,
          meta: {
            docName: inboxDoc.filename,
            checklistItem: item.name,
            previousVersion,
            newVersion,
          },
        });
      } else {
        addActivityEntry({
          actor: currentUserRole,
          category: "docs",
          type: "DOC_ATTACHED",
          message: `${currentUserRole} attached "${inboxDoc.filename}" to "${item.name}" (v${newVersion})`,
          meta: {
            docName: inboxDoc.filename,
            checklistItem: item.name,
            version: newVersion,
          },
        });
      }
      if (statusAutoReset) {
        addActivityEntry({
          actor: "System",
          category: "docs",
          type: "STATUS_AUTO_RESET",
          message: `Status auto-reset to Pending Review due to new upload on "${item.name}"`,
          meta: {
            checklistItem: item.name,
            previousStatus,
            newStatus: "pending",
          },
        });
      }
    }

    toast.success(
      isReplacement
        ? `Replaced document on "${item.name}" (v${newVersion})`
        : `Attached "${inboxDoc.filename}" to "${item.name}" (v${newVersion})`
    );
  };

  const hasChecklist = !!checklistTemplateId;

  const handleViewAttachedDocument = async (storagePath: string) => {
    const url = await getSignedUrl(storagePath);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open document");
  };

  console.log("Checklist debug", {
  checklistTemplateId,
  checklistTemplates,
  checklistTemplatesLength: checklistTemplates.length,
  isLoadingTemplates,
  isSavingChecklist,
});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Documents
          </CardTitle>
          <div className="flex items-center gap-3">
            {hasChecklist && (
              <div className="text-sm text-slate-600">
                {completedCount} of {totalCount} complete
              </div>
            )}
            {!isReadOnly && (
              <Select
              value={checklistTemplateId ?? ""}
              onValueChange={(v) => {
                console.log("REAL SELECT CHANGED:", v);
                onChecklistTemplateSelect(v);
              }}
              disabled={false}
            >
              <SelectTrigger
                className="w-[280px] h-9 px-3.5 py-2 border border-slate-200 bg-white shadow-sm"
                size="default"
              >
                <SelectValue
                  placeholder={
                    isLoadingTemplates
                      ? "Loading..."
                      : isSavingChecklist
                      ? "Saving..."
                      : "Select checklist type"
                  }
                />
              </SelectTrigger>
            
              <SelectContent className="min-w-[280px] p-1.5" align="end">
                {checklistTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="py-2.5 pl-3 text-sm">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
        </div>
        {hasChecklist && (
          <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-emerald-600 h-2 rounded-full transition-all"
              style={totalCount > 0 ? { width: `${(completedCount / totalCount) * 100}%` } : { width: "0%" }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!hasChecklist ? (
          <div className="text-center py-12 px-6">
            <FileText className="h-14 w-14 mx-auto mb-4 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-800 mb-2">
              No checklist selected yet
            </h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">
              Choose a checklist to load the required documents and compliance items.
            </p>
          </div>
        ) : (
        <div className="space-y-3">
          {checklistItems.map((item, index) => {
            const prevSection = index > 0 ? checklistItems[index - 1].sectionTitle : undefined;
            const showSectionHeader = item.sectionTitle && item.sectionTitle !== prevSection;
            return (
              <React.Fragment key={item.id}>
                {showSectionHeader && (
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2 pb-1 first:pt-0">
                    {item.sectionTitle}
                  </div>
                )}
                <div
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                >
              <div className="flex items-center gap-3 flex-1">
                {getChecklistIcon(item.reviewStatus)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">
                      {item.name}
                    </span>
                    {getRequirementBadge(item.requirement)}
                    {item.version > 1 && (
                      <span className="text-xs text-slate-500 font-mono">
                        v{item.version}
                      </span>
                    )}
                    {item.suggestedDocument && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 border text-xs">
                        Suggested {item.suggestedDocument.confidence === "high" ? "(High confidence)" : "(Low confidence)"}
                      </Badge>
                    )}
                    {!item.attachedDocument && !item.suggestedDocument && (
                      <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-300 text-xs">
                        Needs attachment
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-slate-600">{item.updatedAt}</div>
                  {item.attachedDocument && (
                    <div className="mt-2 space-y-1">
                      <div className="p-2 bg-slate-100 rounded border border-slate-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 min-w-0">
                          <Paperclip className="h-3 w-3 flex-shrink-0" />
                          <span className="font-medium">Attached:</span>
                          <span className="text-slate-900 font-medium truncate">{item.attachedDocument.filename}</span>
                          <span className="text-slate-400">•</span>
                          <span>Version: {item.attachedDocument.version}</span>
                          <span className="text-slate-400">•</span>
                          <span>Last updated: {formatRelativeTime(item.attachedDocument.updatedAt)}</span>
                        </div>
                        {item.attachedDocument.storage_path && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 h-7 text-xs"
                            onClick={() => handleViewAttachedDocument(item.attachedDocument!.storage_path)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        )}
                      </div>
                      {item.attachedDocument.previousVersion &&
                        item.attachedDocument.version > 1 &&
                        (new Date().getTime() - item.attachedDocument.updatedAt.getTime()) < 24 * 60 * 60 * 1000 && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 pl-2">
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            <span>Replaced v{item.attachedDocument.previousVersion}</span>
                          </div>
                        )}
                    </div>
                  )}
                  {item.suggestedDocument && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-600">
                      <Link className="h-3 w-3" />
                      <span>Suggested: {item.suggestedDocument.filename}</span>
                    </div>
                  )}
                  {(() => {
                    const comments = item.comments as Array<{
                      id: string;
                      type?: string;
                      message?: string;
                      createdAt?: Date;
                    }>;
                    const statusChangeComments = comments
                      .filter(
                        (c) =>
                          c.type === "StatusChange" &&
                          (c.message?.startsWith("Rejected:") || c.message?.startsWith("Waived:"))
                      )
                      .sort(
                        (a, b) =>
                          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
                      );
                    const latestStatusComment = statusChangeComments[0];

                    return latestStatusComment &&
                      (item.reviewStatus === "rejected" || item.reviewStatus === "waived") ? (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-600 bg-slate-100 px-2 py-1.5 rounded border border-slate-200">
                        <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1 flex-1">
                          {latestStatusComment.message}
                        </span>
                        {onOpenComments && (
                          <button
                            onClick={() => onOpenComments(item)}
                            className="text-blue-600 hover:text-blue-700 hover:underline font-medium whitespace-nowrap ml-2"
                          >
                            View thread
                          </button>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getReviewStatusBadge(item.reviewStatus)}
                {item.suggestedDocument && !isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAttachSuggested(item)}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attach
                  </Button>
                )}
                {item.attachedDocument && !isReadOnly && onOpenAttachDrawer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenAttachDrawer(item)}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Replace
                  </Button>
                )}
                {!item.attachedDocument && !item.suggestedDocument && !isReadOnly && onOpenAttachDrawer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenAttachDrawer(item)}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attach
                  </Button>
                )}
                {onOpenComments && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenComments(item)}
                    className="relative"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Comments
                    {hasUnreadComments(item, currentUserRole) && (
                      <span className="absolute top-1 right-1 h-2 w-2 bg-blue-600 rounded-full" />
                    )}
                    {item.comments.length > 0 && (
                      <Badge className="ml-2 bg-blue-600 text-white border-0 h-5 min-w-[20px] px-1.5">
                        {item.comments.length}
                      </Badge>
                    )}
                  </Button>
                )}
                {currentUserRole === "Admin" && !isReadOnly && onOpenReviewModal && item.attachedDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenReviewModal(item)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Review
                  </Button>
                )}
              </div>
            </div>
              </React.Fragment>
            );
          })}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
