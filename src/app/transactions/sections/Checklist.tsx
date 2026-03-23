import React, { useEffect, useMemo, useState } from "react";
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
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
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
import { fetchChecklistTemplateSectionsAndItems } from "../../../services/checklistTemplates";
import { getSignedUrl, attachDocumentToChecklistItem } from "../../../services/transactionDocuments";
import {
  getDocumentState,
  getTransactionClosingReadiness,
} from "../../../lib/documents/documentEngine";
import {
  checklistItemToEngineDocument,
  buildEngineUser,
} from "../../../lib/documents/adapter";
import { uiTransactionRoleToEngineRole } from "../../../services/auth";
import type { DocumentStatus } from "../../../lib/documents/types";

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

function getChecklistIcon(status: DocumentStatus, waived?: boolean) {
  if (waived) return <CheckCircle2 className="h-5 w-5 text-slate-400" />;
  switch (status) {
    case "ACCEPTED":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "REJECTED":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "SUBMITTED":
      return <Clock className="h-5 w-5 text-amber-600" />;
    case "NOT_SUBMITTED":
    default:
      return <Clock className="h-5 w-5 text-slate-400" />;
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

function getReviewStatusBadge(status: DocumentStatus, waived?: boolean) {
  if (waived) {
    return (
      <Badge className="bg-slate-50 text-slate-700 border-slate-300 border">
        Waived / Not Required
      </Badge>
    );
  }
  switch (status) {
    case "ACCEPTED":
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">
          Complete
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 border">
          Rejected
        </Badge>
      );
    case "SUBMITTED":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 border">
          Pending Review
        </Badge>
      );
    case "NOT_SUBMITTED":
      return (
        <Badge className="bg-slate-50 text-slate-600 border-slate-300 border">
          Not Submitted
        </Badge>
      );
    default:
      return null;
  }
}

function hasUnreadComments(
  item: ChecklistItem,
  currentUserRole: "Admin" | "Agent" | "Broker"
): boolean {
  const comments = item.comments as Array<{
    type?: string;
    visibility?: string;
    unread?: { Admin?: boolean; Agent?: boolean; Broker?: boolean };
  }>;
  return comments.some((comment) => {
    const isVisible =
      currentUserRole === "Admin" ||
      currentUserRole === "Broker" ||
      (currentUserRole === "Agent" && comment.visibility === "Shared");
    const unreadForViewer =
      currentUserRole === "Broker"
        ? comment.unread?.Broker ?? comment.unread?.Admin
        : comment.unread?.[currentUserRole];
    return isVisible && unreadForViewer === true;
  });
}

export type TransactionContextForChecklist = {
  id: string;
  officeId: string;
  agentUserId?: string | null;
  assignedAdminUserId?: string | null;
  closingDate?: string | null;
};

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
  transactionContext?: TransactionContextForChecklist | null;
  currentUserId?: string;
  currentUserRole?: "Admin" | "Agent" | "Broker";
  isReadOnly?: boolean;
  addActivityEntry?: (entry: {
    actor: "System" | "Agent" | "Admin" | "Broker";
    category: "docs" | "forms" | "system";
    type: string;
    message: string;
    meta?: Record<string, unknown>;
    documentId?: string | null;
    checklistItemId?: string | null;
  }) => void;
  onOpenAttachDrawer?: (item?: ChecklistItem) => void;
  onOpenComments?: (item: ChecklistItem) => void;
  onOpenReviewModal?: (item: ChecklistItem) => void;
  /** Transaction-level rename only; persists `checklist_items.name`. */
  onRenameChecklistItem?: (item: ChecklistItem, newName: string) => Promise<void>;
  /** Add a transaction-only item under a template section. */
  onAddCustomChecklistItem?: (args: {
    templateSectionId: string;
    name: string;
    required: boolean;
  }) => Promise<void>;
  onArchiveChecklistItem?: (item: ChecklistItem) => Promise<void>;
  onRestoreChecklistItem?: (item: ChecklistItem) => Promise<void>;
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
  transactionContext,
  currentUserId = "",
  currentUserRole = "Admin",
  isReadOnly = false,
  addActivityEntry,
  onOpenAttachDrawer,
  onOpenComments,
  onOpenReviewModal,
  onRenameChecklistItem,
  onAddCustomChecklistItem,
  onArchiveChecklistItem,
  onRestoreChecklistItem,
}: ChecklistProps) {
  const [renameTarget, setRenameTarget] = useState<ChecklistItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [templateSections, setTemplateSections] = useState<{ id: string; name: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addSectionId, setAddSectionId] = useState<string>("");
  const [addName, setAddName] = useState("");
  const [addRequired, setAddRequired] = useState(true);
  const [addSaving, setAddSaving] = useState(false);

  const engineUser = buildEngineUser({
    id: currentUserId,
    roles: [uiTransactionRoleToEngineRole(currentUserRole)],
    officeIds: transactionContext ? [transactionContext.officeId ?? ""] : [],
  });
  const engineTxn = transactionContext
    ? {
        id: transactionContext.id,
        officeId: transactionContext.officeId,
        agentUserId: transactionContext.agentUserId ?? null,
        assignedAdminUserId: transactionContext.assignedAdminUserId ?? null,
        closingDate: transactionContext.closingDate ?? null,
      }
    : null;

  useEffect(() => {
    if (!checklistTemplateId) {
      setTemplateSections([]);
      return;
    }
    let cancelled = false;
    void fetchChecklistTemplateSectionsAndItems(checklistTemplateId).then((raw) => {
      if (cancelled || !raw) return;
      setTemplateSections(
        raw.sections.map((s) => ({ id: s.id, name: (s.name ?? "").trim() || "Section" }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [checklistTemplateId]);

  const AUDIT_TX = "133d5fd0-6298-4e57-822e-345ad812a0f1";
  useEffect(() => {
    if (!transactionContext || transactionContext.id !== AUDIT_TX || checklistItems.length === 0) return;
    const target =
      checklistItems.find(
        (i) =>
          (i.documentId || i.attachedDocument) &&
          (i.reviewStatus === "pending" || i.reviewStatus === "rejected")
      ) ?? checklistItems[0];
    const eu = buildEngineUser({
      id: currentUserId,
      roles: [uiTransactionRoleToEngineRole(currentUserRole)],
      officeIds: transactionContext ? [transactionContext.officeId ?? ""] : [],
    });
    const et = transactionContext
      ? {
          id: transactionContext.id,
          officeId: transactionContext.officeId,
          agentUserId: transactionContext.agentUserId ?? null,
          assignedAdminUserId: transactionContext.assignedAdminUserId ?? null,
          closingDate: transactionContext.closingDate ?? null,
        }
      : null;
    const engineDoc = checklistItemToEngineDocument(
      target,
      transactionContext.id,
      transactionContext.officeId ?? "",
      { assignedAdminUserId: transactionContext.assignedAdminUserId ?? null }
    );
    const docState = getDocumentState(engineDoc, eu, et);
    const showReviewActionsAudit =
      docState.canReview &&
      !!target.attachedDocument &&
      (docState.currentActionOwner === "ADMIN" ||
        (!!transactionContext.assignedAdminUserId &&
          !!currentUserId &&
          transactionContext.assignedAdminUserId === currentUserId));
    console.log("[BTQ checklist review audit]", {
      checklistItemId: target.id,
      name: target.name,
      rawDbBacked: {
        status: target.status,
        reviewStatus: target.reviewStatus,
        reviewnote: target.reviewNote,
        documentId: target.documentId,
      },
      attachedDocument: target.attachedDocument,
      docState,
      canReview: docState.canReview,
      currentActionOwner: docState.currentActionOwner,
      showReviewActions: showReviewActionsAudit,
      assignedAdminUserId: transactionContext.assignedAdminUserId,
      currentUserId,
      currentUserRole,
    });
  }, [
    transactionContext?.id,
    transactionContext?.officeId,
    transactionContext?.assignedAdminUserId,
    transactionContext?.agentUserId,
    transactionContext?.closingDate,
    checklistItems,
    currentUserId,
    currentUserRole,
  ]);

  const activeChecklistItems = useMemo(
    () => checklistItems.filter((i) => !i.archivedAt),
    [checklistItems]
  );

  const engineDocs = activeChecklistItems.map((item) =>
    checklistItemToEngineDocument(item, transactionContext?.id ?? "", transactionContext?.officeId ?? "", {
      assignedAdminUserId: transactionContext?.assignedAdminUserId ?? null,
    })
  );
  const closingReadiness = getTransactionClosingReadiness(engineDocs);
  const completedCount = closingReadiness.acceptedRequiredCount + (closingReadiness.waivedRequiredCount ?? 0);
  const totalCount = activeChecklistItems.length;

  const archivedGroups = useMemo(() => {
    const archived = checklistItems.filter((i) => i.archivedAt);
    const byKey = new Map<
      string,
      { groupId: string; label: string; note: string | null; createdAt: string; items: ChecklistItem[] }
    >();
    for (const item of archived) {
      const gid = item.archiveGroupId ?? "__ungrouped";
      const label = item.archiveGroupLabel ?? "Archived";
      const note = item.archiveGroupNote ?? null;
      const createdAt = item.archiveGroupCreatedAt ?? item.archivedAt ?? "";
      const existing = byKey.get(gid);
      if (existing) {
        existing.items.push(item);
      } else {
        byKey.set(gid, { groupId: gid, label, note, createdAt, items: [item] });
      }
    }
    const list = Array.from(byKey.values());
    for (const g of list) {
      g.items.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
      );
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [checklistItems]);

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

    const isReferenceOnly = item.isComplianceDocument === false;
    if (!isReplacement) {
      newReviewStatus = isReferenceOnly ? "complete" : "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      newReviewStatus = isReferenceOnly ? "complete" : "pending";
      statusAutoReset = !isReferenceOnly;
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
          documentId: inboxDoc.id,
          checklistItemId: item.id,
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
          documentId: inboxDoc.id,
          checklistItemId: item.id,
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
          checklistItemId: item.id,
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

  async function handleConfirmRename() {
    if (!renameTarget || !onRenameChecklistItem) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    setRenameSaving(true);
    try {
      await onRenameChecklistItem(renameTarget, trimmed);
      setRenameTarget(null);
    } catch {
      // Parent surfaces errors (toast); keep dialog open.
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleSubmitAddCustom() {
    if (!onAddCustomChecklistItem || !addSectionId) return;
    setAddSaving(true);
    try {
      await onAddCustomChecklistItem({
        templateSectionId: addSectionId,
        name: addName,
        required: addRequired,
      });
      setAddOpen(false);
      setAddName("");
    } catch {
      // Parent surfaces errors (toast); keep dialog open.
    } finally {
      setAddSaving(false);
    }
  }

  const { itemsByTemplateSectionId, orphanChecklistItems } = useMemo(() => {
    const templateIds = new Set(templateSections.map((s) => s.id));
    const bySection = new Map<string, ChecklistItem[]>();
    for (const s of templateSections) {
      bySection.set(s.id, []);
    }
    const orphans: ChecklistItem[] = [];
    for (const item of activeChecklistItems) {
      const sid = item.section_id ?? null;
      if (sid && templateIds.has(sid)) {
        bySection.get(sid)!.push(item);
      } else {
        orphans.push(item);
      }
    }
    return { itemsByTemplateSectionId: bySection, orphanChecklistItems: orphans };
  }, [activeChecklistItems, templateSections]);

  function renderChecklistItemRow(item: ChecklistItem, rowVariant: "active" | "archived" = "active") {
    const isArchivedRow = rowVariant === "archived";
    const engineDoc = checklistItemToEngineDocument(
      item,
      transactionContext?.id ?? "",
      transactionContext?.officeId ?? "",
      { assignedAdminUserId: transactionContext?.assignedAdminUserId ?? null }
    );
    const docState = getDocumentState(engineDoc, engineUser, engineTxn);
    return (
    <div
      key={item.id}
      className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
    >
    <div className="shrink-0 pt-0.5">
      {getChecklistIcon(docState.status, item.reviewStatus === "waived")}
    </div>
    <div className="min-w-0 flex-1 flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 min-h-0 flex-1 items-center justify-start gap-1">
          <span
            className="min-w-0 truncate font-medium text-slate-900"
            title={item.name}
          >
            {item.name}
          </span>
          {!isArchivedRow && !isReadOnly && onRenameChecklistItem && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-800"
              title="Rename checklist item"
              onClick={() => {
                setRenameTarget(item);
                setRenameDraft(item.name);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Rename checklist item</span>
            </Button>
          )}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          {getRequirementBadge(item.requirement)}
          {getReviewStatusBadge(docState.status, item.reviewStatus === "waived")}
          {item.suggestedDocument && !isArchivedRow && !isReadOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Attach suggested document"
              onClick={() => handleAttachSuggested(item)}
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Attach suggested document</span>
            </Button>
          )}
          {item.attachedDocument && !isArchivedRow && !isReadOnly && onOpenAttachDrawer && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Replace attachment"
              onClick={() => onOpenAttachDrawer(item)}
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Replace attachment</span>
            </Button>
          )}
          {!item.attachedDocument && !item.suggestedDocument && !isArchivedRow && !isReadOnly && onOpenAttachDrawer && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Attach document"
              onClick={() => onOpenAttachDrawer(item)}
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Attach document</span>
            </Button>
          )}
          {onOpenComments && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Comments"
              onClick={() => onOpenComments(item)}
              className="relative h-8 w-8 shrink-0 text-slate-600"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              <span className="sr-only">Comments</span>
              {hasUnreadComments(item, currentUserRole) && (
                <span
                  className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-slate-50"
                  aria-hidden
                />
              )}
              {item.comments.length > 0 && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-slate-50"
                  aria-hidden
                >
                  {item.comments.length}
                </span>
              )}
            </Button>
          )}
          {!isArchivedRow && !isReadOnly && onOpenReviewModal && item.attachedDocument && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Review document"
              onClick={() => onOpenReviewModal(item)}
            >
              <Eye className="h-4 w-4" />
              <span className="sr-only">Review document</span>
            </Button>
          )}
          {!isArchivedRow && !isReadOnly && onArchiveChecklistItem && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Archive checklist item"
              onClick={() => {
                if (
                  !window.confirm(
                    "Archive this checklist item? It will move to the Archived section below."
                  )
                )
                  return;
                void onArchiveChecklistItem(item);
              }}
            >
              <Archive className="h-4 w-4" />
              <span className="sr-only">Archive checklist item</span>
            </Button>
          )}
          {isArchivedRow && !isReadOnly && onRestoreChecklistItem && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-600"
              title="Restore to active checklist"
              onClick={() => void onRestoreChecklistItem(item)}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Restore to active checklist</span>
            </Button>
          )}
        </div>
      </div>
      {item.isComplianceDocument === false && (
        <p className="text-xs text-slate-500 mt-1 max-w-xl">
          Reference documents are not reviewed for compliance
        </p>
      )}
      {item.version > 1 && !item.attachedDocument && (
        <p className="text-xs text-slate-500 font-mono mt-1">v{item.version}</p>
      )}
      {item.attachedDocument && (
        <div className="mt-2 space-y-1 w-full min-w-0">
          <div className="p-2 bg-slate-100 rounded border border-slate-200 flex items-center justify-between gap-2 w-full max-w-[500px] min-w-0 overflow-hidden">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-700">
              <Paperclip className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium shrink-0">Attached:</span>
              <span
                className="min-w-0 flex-1 truncate text-slate-900 font-medium"
                title={item.attachedDocument.filename}
              >
                {item.attachedDocument.filename}
              </span>
              <span className="text-slate-400 shrink-0">•</span>
              <span className="shrink-0 whitespace-nowrap">
                Version: {item.attachedDocument.version}
              </span>
              <span className="text-slate-400 shrink-0">•</span>
              <span className="shrink-0 whitespace-nowrap">
                Last updated: {formatRelativeTime(item.attachedDocument.updatedAt)}
              </span>
              {item.version > 1 && (
                <>
                  <span className="text-slate-400 shrink-0">•</span>
                  <span className="shrink-0 whitespace-nowrap font-mono">
                    Item v{item.version}
                  </span>
                </>
              )}
            </div>
            {item.attachedDocument.storage_path && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-600"
                title="View attached document"
                onClick={() => handleViewAttachedDocument(item.attachedDocument!.storage_path)}
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">View attached document</span>
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
          (docState.status === "REJECTED" || item.reviewStatus === "waived") ? (
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
    );
  }

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
          {templateSections.map((section, sectionIndex) => {
            const sectionItems = itemsByTemplateSectionId.get(section.id) ?? [];
            return (
              <React.Fragment key={section.id}>
                <div
                  className={`flex items-center justify-between gap-2 pb-1 ${
                    sectionIndex === 0 ? "pt-0" : "pt-2"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {section.name}
                  </div>
                  {!isReadOnly && onAddCustomChecklistItem && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-xs text-slate-600"
                      onClick={() => {
                        setAddSectionId(section.id);
                        setAddName("");
                        setAddRequired(true);
                        setAddOpen(true);
                      }}
                    >
                      + Add item
                    </Button>
                  )}
                </div>
                {sectionItems.map((item) => renderChecklistItemRow(item))}
              </React.Fragment>
            );
          })}
          {orphanChecklistItems.length > 0 && (
            <React.Fragment key="__orphans__">
              <div className="flex items-center justify-between gap-2 pt-2 pb-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Other
                </div>
              </div>
              {orphanChecklistItems.map((item) => renderChecklistItemRow(item))}
            </React.Fragment>
          )}
          {archivedGroups.length > 0 && (
            <div className="mt-6 space-y-4 border-t border-slate-200 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Archived
              </div>
              {archivedGroups.map((group) => (
                <div key={group.groupId} className="space-y-2">
                  <div className="rounded-md border border-slate-200 bg-slate-100/80 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{group.label}</p>
                    {group.note ? (
                      <p className="mt-1 text-xs text-slate-600">{group.note}</p>
                    ) : null}
                  </div>
                  {group.items.map((item) => renderChecklistItemRow(item, "archived"))}
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </CardContent>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename checklist item</DialogTitle>
            <DialogDescription>
              This name applies only to this transaction. It does not change the checklist template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="checklist-item-rename">Name</Label>
            <Input
              id="checklist-item-rename"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !renameSaving) {
                  e.preventDefault();
                  void handleConfirmRename();
                }
              }}
              disabled={renameSaving}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={renameSaving}
              onClick={() => {
                setRenameTarget(null);
                setRenameDraft("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={renameSaving} onClick={() => void handleConfirmRename()}>
              {renameSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddName("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add checklist item</DialogTitle>
            <DialogDescription>
              Adds a document slot for this transaction only. It does not change the checklist template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Section</Label>
              <Select value={addSectionId} onValueChange={setAddSectionId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose section" />
                </SelectTrigger>
                <SelectContent>
                  {templateSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="checklist-custom-name">Item name</Label>
              <Input
                id="checklist-custom-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Repair addendum"
                disabled={addSaving}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="checklist-custom-required"
                checked={addRequired}
                onCheckedChange={(v) => setAddRequired(v === true)}
                disabled={addSaving}
              />
              <Label htmlFor="checklist-custom-required" className="text-sm font-normal cursor-pointer">
                Required
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={addSaving} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSaving || !addSectionId || !addName.trim()}
              onClick={() => void handleSubmitAddCustom()}
            >
              {addSaving ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
