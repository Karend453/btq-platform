import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Save, Archive, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import {
  archiveChecklistItem,
  ensureChecklistItemsForTransaction,
  fetchChecklistItemsForTransaction,
  insertCustomChecklistItem,
  replaceChecklistItemsFromTemplate,
  restoreChecklistItem,
  updateChecklistItem,
} from "../../services/checklistItems";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  getTransaction,
  getAssignedAdminUserId,
  getAssignedAgentDisplayNameFromRow,
  formatAgentLabelForList,
  updateTransaction,
  type TransactionRow,
} from "../../services/transactions";
import { fetchDocumentsByTransactionId, getSignedUrl } from "../../services/transactionDocuments";
import { fetchCommentsByTransactionId, insertComment } from "../../services/checklistItemComments";
import { insertActivityEntry, fetchActivityByTransactionId } from "../../services/transactionActivity";
import {
  getCurrentUser,
  getTransactionRuntimeRole,
  transactionRuntimeRoleToUiRole,
  uiTransactionRoleToEngineRole,
  type UiTransactionRole,
} from "../../services/auth";
import { useAuth } from "../contexts/AuthContext";
import {
  canUserMarkAccepted,
  canUserReviewDocument,
  getDocumentState,
  getTransactionClosingReadiness,
} from "../../lib/documents/documentEngine";
import {
  checklistItemToEngineDocument,
  buildEngineUser,
  transactionRowToEngineTransaction,
  checklistItemForControlsToEngineDocument,
} from "../../lib/documents/adapter";
import {
  fetchOfficeChecklistTemplatesForTransactionSelect,
  type ChecklistTemplate,
} from "../../services/checklistTemplates";
import { getOfficeById } from "../../services/offices";
import { countChecklistItemsForTransaction } from "../../services/checklistItems";
import TransactionOverview from "./sections/TransactionOverview";
import FormsEngineLaunchDialog from "./sections/FormsEngineLaunchDialog";
import TransactionInbox from "./sections/TransactionInbox";
import TransactionControls from "./sections/TransactionControls";
import TransactionActivity from "./sections/TransactionActivity";
import Checklist from "./sections/Checklist";
import type { ChecklistItem, InboxDocument } from "./sections/TransactionInbox";
import type { ArchiveMetadata, TransactionStatus } from "./sections/TransactionControls";
import type { ActivityLogEntry, ActivityFilter } from "./sections/TransactionActivity";

type CommentShape = {
  id: string;
  authorRole: "Admin" | "Agent" | "Broker";
  authorName: string;
  createdAt: Date;
  message: string;
  visibility: "Internal" | "Shared";
  type?: "Comment" | "StatusChange" | "System";
  unread?: { Admin?: boolean; Agent?: boolean; Broker?: boolean };
  // Optional for structured review comments
  pageNumber?: number;
  locationNote?: string;
};
function formatCurrency(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue =
    typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));

  if (Number.isNaN(numericValue)) return String(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

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

/** Re-resolve inbox attachments onto checklist rows (no DB seeding). */
function mergeInboxIntoChecklistItems(
  items: ChecklistItem[],
  inboxDocuments: InboxDocument[]
): ChecklistItem[] {
  return items.map((item) => {
    const attached =
      inboxDocuments.find(
        (d) =>
          d.attachedToItemId != null && String(d.attachedToItemId) === String(item.id)
      ) ??
      (item.documentId
        ? inboxDocuments.find((d) => d.id === item.documentId)
        : undefined);
    return {
      ...item,
      attachedDocument: attached
        ? {
            id: attached.id,
            filename: attached.filename,
            storage_path: attached.storage_path,
            version: 1,
            updatedAt: attached.receivedAt,
          }
        : undefined,
    };
  });
}

/** Extension from storage object key first, then display name — used for iframe vs img vs fallback only. */
function getReviewPreviewExtensionHint(
  storagePath: string | undefined,
  displayFilename: string | undefined
): string {
  const segment = (storagePath ?? "").trim().split("/").filter(Boolean).pop() ?? "";
  let lastDot = segment.lastIndexOf(".");
  if (lastDot >= 0 && lastDot < segment.length - 1) {
    return segment.slice(lastDot).toLowerCase();
  }
  const name = (displayFilename ?? "").trim();
  lastDot = name.lastIndexOf(".");
  if (lastDot >= 0 && lastDot < name.length - 1) {
    return name.slice(lastDot).toLowerCase();
  }
  return "";
}

function getReviewInlinePreviewKind(
  storagePath: string | undefined,
  displayFilename: string | undefined
): "pdf" | "image" | "other" {
  const ext = getReviewPreviewExtensionHint(storagePath, displayFilename);
  if (ext === ".pdf") return "pdf";
  if (/^\.(jpe?g|png|gif|webp)$/i.test(ext)) return "image";
  return "other";
}

export default function TransactionDetailsPage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const id = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  /** Resolved label for overview; `undefined` = loading when `transactions.office` is set. */
  const [officeDisplayLabel, setOfficeDisplayLabel] = useState<string | undefined>(undefined);
  const [inboxDocuments, setInboxDocuments] = useState<InboxDocument[]>([]);
  const inboxDocumentsRef = useRef(inboxDocuments);
  inboxDocumentsRef.current = inboxDocuments;
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  /** True if any checklist_items row exists — locks template switching. */
  const [checklistMaterialized, setChecklistMaterialized] = useState(false);

  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>("Pre-Contract");
  const [assignedAdmin, setAssignedAdmin] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [contractDate, setContractDate] = useState<string | null>(null);
  const [archiveMetadata, setArchiveMetadata] = useState<ArchiveMetadata | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [attachDrawerOpen, setAttachDrawerOpen] = useState(false);
  const [attachTargetItem, setAttachTargetItem] = useState<ChecklistItem | null>(null);

  // Comments drawer state
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);
  const [commentsTargetItem, setCommentsTargetItem] = useState<ChecklistItem | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"Internal" | "Shared">("Shared");
  const [notifyAgentOnComment, setNotifyAgentOnComment] = useState(true);

  const [zipFormsLaunchOpen, setZipFormsLaunchOpen] = useState(false);
  const [dotloopLaunchOpen, setDotloopLaunchOpen] = useState(false);

  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [reviewRequirement, setReviewRequirement] = useState<"required" | "optional">("required");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "rejected" | "complete" | "waived">("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [waivedReason, setWaivedReason] = useState("");
  const [notifyAgent, setNotifyAgent] = useState(true);
  // Review workspace document preview
  const [reviewDocUrl, setReviewDocUrl] = useState<string | null>(null);
  const [reviewDocUrlLoading, setReviewDocUrlLoading] = useState(false);
  const [reviewDocUrlError, setReviewDocUrlError] = useState(false);
  // Review workspace comment form
  const [reviewCommentText, setReviewCommentText] = useState("");

  const reviewCommentsEndRef = useRef<HTMLDivElement>(null);

  const [currentUserName, setCurrentUserName] = useState<string>("Current User");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<UiTransactionRole>("Admin");

  const reloadTransaction = useCallback(
    async (opts?: { isCancelled?: () => boolean }) => {
      if (!id) return;
      const data = await getTransaction(id);
      if (opts?.isCancelled?.()) return;
      setTransaction(data);
      if (data) {
        setTransactionStatus((data.status ?? "Pre-Contract") as TransactionStatus);
        setAssignedAdmin(data.assignedadmin ?? null);
        setClosingDate(data.closing_date ?? null);
        setContractDate(data.contractdate ?? null);
      }
    },
    [id]
  );

  /** Prefer AuthContext user id so review permissions are correct before getCurrentUser() effect runs. */
  const sessionUserId = authUser?.id ?? currentUserId;

  const reviewModalPermissions = useMemo(() => {
    if (!selectedItem || !id || !transaction) return { canMarkAccepted: false, canReview: false };
    const txn = transaction as TransactionRow & { office?: string };
    const engineDoc = checklistItemToEngineDocument(selectedItem, id, txn.office ?? "", {
      assignedAdminUserId: getAssignedAdminUserId(transaction as TransactionRow),
    });
    const engineUser = buildEngineUser({
      id: sessionUserId,
      roles: [uiTransactionRoleToEngineRole(currentUserRole)],
      officeIds: [txn.office ?? ""],
    });
    const engineTxn = transactionRowToEngineTransaction(transaction as TransactionRow & { office?: string });
    return {
      canMarkAccepted: canUserMarkAccepted(engineUser, engineDoc, engineTxn),
      canReview: canUserReviewDocument(engineUser, engineDoc, engineTxn),
    };
  }, [selectedItem, id, transaction, sessionUserId, currentUserRole, authUser?.id]);

  /** Runtime audit: filter console by `[BTQ review audit]` */
  useEffect(() => {
    console.log("[BTQ review audit] session", {
      authUserId: authUser?.id ?? null,
      sessionUserId,
      currentUserId,
      currentUserRole,
    });
    const row = transaction as (TransactionRow & { office?: string }) | null;
    if (!transaction || !row) return;
    const engineTxn = transactionRowToEngineTransaction(row);
    console.log("[BTQ review audit] transaction", {
      transactionId: row.id,
      assigned_admin_user_id: row.assigned_admin_user_id ?? null,
      engineTxn_assignedAdminUserId: engineTxn.assignedAdminUserId,
    });
    if (selectedItem && id) {
      const engineDoc = checklistItemToEngineDocument(selectedItem, id, row.office ?? "", {
        assignedAdminUserId: getAssignedAdminUserId(row as TransactionRow),
      });
      const engineUser = buildEngineUser({
        id: sessionUserId,
        roles: [uiTransactionRoleToEngineRole(currentUserRole)],
        officeIds: [row.office ?? ""],
      });
      const canReview = canUserReviewDocument(engineUser, engineDoc, engineTxn);
      const canMarkAccepted = canUserMarkAccepted(engineUser, engineDoc, engineTxn);
      console.log("[BTQ review audit] reviewModal", {
        engineUser,
        engineDoc,
        engineTxn,
        canReview,
        canMarkAccepted,
      });
    }
    if (checklistItems.length > 0 && id) {
      const item = checklistItems[0];
      const engineDoc0 = checklistItemToEngineDocument(item, id, row.office ?? "", {
        assignedAdminUserId: getAssignedAdminUserId(row as TransactionRow),
      });
      const engineUser0 = buildEngineUser({
        id: sessionUserId,
        roles: [uiTransactionRoleToEngineRole(currentUserRole)],
        officeIds: [row.office ?? ""],
      });
      const engineTxnChecklist = {
        id,
        officeId: row.office ?? "",
        agentUserId: row.agent_user_id ?? null,
        assignedAdminUserId: getAssignedAdminUserId(row as TransactionRow),
        closingDate: row.closing_date ?? null,
      };
      const docState = getDocumentState(engineDoc0, engineUser0, engineTxnChecklist);
      const showReviewActionsLegacy = docState.canReview && docState.currentActionOwner === "ADMIN";
      const showReviewActionsFixed =
        docState.canReview &&
        !!item.attachedDocument &&
        (docState.currentActionOwner === "ADMIN" ||
          (!!engineTxnChecklist.assignedAdminUserId &&
            !!sessionUserId &&
            engineTxnChecklist.assignedAdminUserId === sessionUserId));
      console.log("[BTQ review audit] checklistRow0", {
        docState,
        showReviewActions_legacy: showReviewActionsLegacy,
        showReviewActions_fixed: showReviewActionsFixed,
      });
    }
  }, [
    authUser?.id,
    sessionUserId,
    currentUserId,
    currentUserRole,
    transaction,
    selectedItem,
    id,
    checklistItems,
  ]);

  async function addActivityEntry(
    entry: Omit<ActivityLogEntry, "id" | "timestamp"> & {
      documentId?: string | null;
      checklistItemId?: string | null;
    }
  ) {
    if (!id) {
      console.warn("[addActivityEntry] skipped: no transaction id");
      return;
    }
    if (authLoading) {
      console.warn("[addActivityEntry] skipped: auth still loading");
      return;
    }
    const insertPayload = {
      transactionId: id,
      actor: entry.actor,
      category: entry.category,
      type: entry.type,
      message: entry.message,
      meta: entry.meta,
      documentId: entry.documentId ?? null,
      checklistItemId: entry.checklistItemId ?? null,
      actorUserId: sessionUserId || null,
    };
    console.log("[BTQ activity debug] addActivityEntry start", {
      activity_type: entry.type,
      fromUpload: entry.type === "document_uploaded",
    });
    console.log("[BTQ activity debug] addActivityEntry payload → insertActivityEntry", insertPayload);
    const inserted = await insertActivityEntry(insertPayload);
    console.log(
      "[BTQ activity debug] addActivityEntry insertActivityEntry returned",
      inserted ? { id: inserted.id, activity_type: inserted.type } : null
    );
    if (inserted) {
      setActivityLog((prev) => [inserted as ActivityLogEntry, ...prev]);
    } else {
      console.warn("[addActivityEntry] insert returned null, entry not persisted");
    }
  }

  function handleOpenAttachDrawer(item?: ChecklistItem) {
    setAttachTargetItem(item ?? null);
    setAttachDrawerOpen(true);
  }

  function handleAttachDrawerOpenChange(open: boolean) {
    setAttachDrawerOpen(open);
    if (!open) setAttachTargetItem(null);
  }

  async function handleRenameChecklistItem(item: ChecklistItem, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      throw new Error("empty name");
    }
    try {
      await updateChecklistItem(item.id, { name: trimmed });
    } catch {
      toast.error("Could not save checklist item name");
      throw new Error("save failed");
    }
    setChecklistItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, name: trimmed } : i))
    );
    toast.success("Checklist item renamed");
  }

  function handleOpenComments(item: ChecklistItem) {
    const comments = (item.comments ?? []) as CommentShape[];
    const updatedComments = comments.map((c) => ({
      ...c,
      unread: { ...(c.unread ?? {}), [currentUserRole]: false },
    }));
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, comments: updatedComments } : i
      )
    );
    setCommentsTargetItem({ ...item, comments: updatedComments });
    setIsCommentsDrawerOpen(true);
    setNewCommentText("");
    setCommentVisibility("Shared");
    setNotifyAgentOnComment(true);
  }

  async function handlePostComment() {
    if (!commentsTargetItem || !newCommentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }
    if (!id) return;
    const comments = (commentsTargetItem.comments ?? []) as CommentShape[];
    const saved = await insertComment({
      transactionId: id,
      checklistItemId: commentsTargetItem.id,
      authorRole: currentUserRole,
      authorName: currentUserName,
      message: newCommentText.trim(),
      visibility: commentVisibility,
      type: "Comment",
      unread: {
        Admin: currentUserRole === "Agent",
        Agent:
          (currentUserRole === "Admin" || currentUserRole === "Broker") &&
          commentVisibility === "Shared",
      },
    });
    if (!saved) {
      toast.error("Failed to save comment");
      return;
    }
    const updatedComments = [...comments, saved];
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === commentsTargetItem.id ? { ...i, comments: updatedComments } : i
      )
    );
    setCommentsTargetItem({ ...commentsTargetItem, comments: updatedComments });
    addActivityEntry({
      actor: currentUserRole,
      category: "docs",
      type: "COMMENT_ADDED",
      message: `${currentUserRole} added a ${commentVisibility.toLowerCase()} comment on "${commentsTargetItem.name}"`,
      meta: { checklistItem: commentsTargetItem.name, visibility: commentVisibility },
      checklistItemId: commentsTargetItem.id,
    });
    setNewCommentText("");
    toast.success("Comment posted");
    setIsCommentsDrawerOpen(false);
  }

  async function handleOpenReviewModal(item: ChecklistItem) {
    setSelectedItem(item);
    setReviewRequirement(item.requirement);
    setReviewStatus(item.reviewStatus);
    setReviewNote("");
    setWaivedReason("");
    setNotifyAgent(true);
    setReviewCommentText("");
    setReviewDocUrl(null);
    setReviewDocUrlError(false);
    setIsReviewModalOpen(true);

    if (item.attachedDocument?.storage_path) {
      setReviewDocUrlLoading(true);
      const url = await getSignedUrl(item.attachedDocument.storage_path);
      setReviewDocUrlLoading(false);
      if (url) {
        setReviewDocUrl(url);
      } else {
        setReviewDocUrlError(true);
      }
    }
  }

  async function handleSaveReview() {
    if (!selectedItem) return;
    if (reviewStatus === "rejected" && !reviewNote.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    if (reviewStatus === "waived" && !waivedReason.trim()) {
      toast.error("Please provide a reason for waiving this requirement");
      return;
    }
    if (!selectedItem.attachedDocument && (reviewStatus === "pending" || reviewStatus === "complete")) {
      toast.error(
        `Cannot mark as "${reviewStatus === "pending" ? "Pending Review" : "Complete"}" without an attached document`
      );
      return;
    }
    if (!id) return;

    const reviewNoteToPersist =
      reviewStatus === "rejected"
        ? reviewNote.trim()
        : reviewStatus === "waived"
          ? waivedReason.trim()
          : null;

    try {
      await updateChecklistItem(selectedItem.id, {
        reviewStatus,
        reviewNote: reviewNoteToPersist,
        required: reviewRequirement === "required",
        status: reviewStatus,
      });
    } catch {
      toast.error("Could not save review to checklist");
      return;
    }

    const comments = (selectedItem.comments ?? []) as CommentShape[];
    const updatedComments = [...comments];
    if (reviewStatus === "rejected" && reviewNote.trim()) {
      const saved = await insertComment({
        transactionId: id,
        checklistItemId: selectedItem.id,
        authorRole: currentUserRole === "Broker" ? "Broker" : "Admin",
        authorName: currentUserName,
        message: reviewNote.trim(),
        visibility: "Shared",
        type: "StatusChange",
        unread: { Agent: true },
      });
      if (!saved) {
        toast.error("Failed to save comment");
        return;
      }
      updatedComments.push(saved);
    } else if (reviewStatus === "waived" && waivedReason.trim()) {
      const saved = await insertComment({
        transactionId: id,
        checklistItemId: selectedItem.id,
        authorRole: currentUserRole === "Broker" ? "Broker" : "Admin",
        authorName: currentUserName,
        message: `Waived: ${waivedReason.trim()}`,
        visibility: "Shared",
        type: "StatusChange",
        unread: { Agent: true },
      });
      if (!saved) {
        toast.error("Failed to save comment");
        return;
      }
      updatedComments.push(saved);
    }

    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === selectedItem.id
          ? {
              ...i,
              requirement: reviewRequirement,
              reviewStatus: reviewStatus,
              comments: updatedComments,
              updatedAt: "Just now",
            }
          : i
      )
    );

    if (commentsTargetItem?.id === selectedItem.id) {
      setCommentsTargetItem({
        ...selectedItem,
        requirement: reviewRequirement,
        reviewStatus: reviewStatus,
        comments: updatedComments,
        updatedAt: "Just now",
      });
    }

    const statusChanged = selectedItem.reviewStatus !== reviewStatus;
    const requirementChanged = selectedItem.requirement !== reviewRequirement;

    if (requirementChanged) {
      addActivityEntry({
        actor: currentUserRole === "Broker" ? "Broker" : "Admin",
        category: "docs",
        type: "CHECKLIST_ITEM_REQUIREMENT_CHANGED",
        message: `${currentUserRole === "Broker" ? "Broker" : "Admin"} marked "${selectedItem.name}" as ${reviewRequirement === "required" ? "Required" : "Optional"}`,
        meta: {
          docName: selectedItem.name,
          fromRequirement: selectedItem.requirement,
          toRequirement: reviewRequirement,
        },
        checklistItemId: selectedItem.id,
        documentId: selectedItem.attachedDocument?.id,
      });
    }

    if (statusChanged) {
      let activityType = "CHECKLIST_ITEM_STATUS_CHANGED";
      let message = "";
      switch (reviewStatus) {
        case "complete":
          activityType = "DOC_REVIEWED";
          message = `Admin approved "${selectedItem.name}"`;
          break;
        case "rejected":
          activityType = "DOC_REJECTED";
          message = `Admin rejected "${selectedItem.name}": ${reviewNote}`;
          break;
        case "waived":
          activityType = "DOC_WAIVED";
          message = `Admin waived "${selectedItem.name}": ${waivedReason}`;
          break;
        case "pending":
          message = `Admin set "${selectedItem.name}" to Pending Review`;
          break;
      }
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: activityType,
        message,
        meta: {
          docName: selectedItem.name,
          fromStatus: selectedItem.reviewStatus,
          toStatus: reviewStatus,
          reason: reviewNote || waivedReason || undefined,
        },
      });
    }

    toast.success("Review saved successfully");
    setIsReviewModalOpen(false);
    setSelectedItem(null);
    setReviewDocUrl(null);
  }

  async function handlePostReviewComment() {
    if (!selectedItem || !reviewCommentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }
    if (!id) return;
    const comments = (selectedItem.comments ?? []) as CommentShape[];
    const saved = await insertComment({
      transactionId: id,
      checklistItemId: selectedItem.id,
      authorRole: currentUserRole,
      authorName: currentUserName,
      message: reviewCommentText.trim(),
      visibility: "Shared",
      type: "Comment",
      unread: {
        Admin: currentUserRole === "Agent",
        Agent: currentUserRole === "Admin" || currentUserRole === "Broker",
      },
    });
    if (!saved) {
      toast.error("Failed to save comment");
      return;
    }
    const updatedComments = [...comments, saved];
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === selectedItem.id ? { ...i, comments: updatedComments } : i
      )
    );
    setSelectedItem({ ...selectedItem, comments: updatedComments });
    if (commentsTargetItem?.id === selectedItem.id) {
      setCommentsTargetItem({ ...selectedItem, comments: updatedComments });
    }
    addActivityEntry({
      actor: currentUserRole,
      category: "docs",
      type: "COMMENT_ADDED",
      message: `${currentUserRole} added a comment on "${selectedItem.name}"`,
      meta: { checklistItem: selectedItem.name },
      checklistItemId: selectedItem.id,
      documentId: selectedItem.attachedDocument?.id,
    });
    setReviewCommentText("");
    toast.success("Comment posted");
    setTimeout(() => reviewCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  function handleOpenReviewDocInNewTab() {
    if (reviewDocUrl) {
      window.open(reviewDocUrl, "_blank");
    } else if (selectedItem?.attachedDocument?.storage_path) {
      getSignedUrl(selectedItem.attachedDocument.storage_path).then((url) => {
        if (url) window.open(url, "_blank");
        else toast.error("Could not open document");
      });
    } else {
      toast.error("No document to open");
    }
  }

  function handleEdit() {
    window.location.href = `/transactions/${id}/edit`;
  }

  async function handleCopyIntakeEmail(text?: string | null) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (!id) {
          if (!cancelled) setTransaction(null);
          return;
        }

        await reloadTransaction({ isCancelled: () => cancelled });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, reloadTransaction]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadDocuments() {
      const docs = await fetchDocumentsByTransactionId(id);
      if (!cancelled) setInboxDocuments(docs);
    }
    loadDocuments();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadActivity() {
      const entries = await fetchActivityByTransactionId(id);
      if (!cancelled) {
        setActivityLog((prev) => {
          const fetchedIds = new Set(entries.map((e) => e.id));
          const localOnly = prev.filter((e) => !fetchedIds.has(e.id));
          return [...localOnly, ...entries].sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          ) as ActivityLogEntry[];
        });
      }
    }
    loadActivity();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) {
        setCurrentUserName(user?.email ?? "Current User");
        setCurrentUserId(user?.id ?? "");
      }
    });
    getTransactionRuntimeRole().then((r) => {
      if (!cancelled) setCurrentUserRole(transactionRuntimeRoleToUiRole(r));
    });
    return () => { cancelled = true; };
  }, [authUser?.id]);

  const checklistTemplateId = transaction?.checklist_template_id?.trim() || null;
  const assignedAgentName = useMemo(() => {
    if (!transaction) return "Unassigned";
    const row = transaction as TransactionRow;
    const raw = getAssignedAgentDisplayNameFromRow(row);
    const formatted = formatAgentLabelForList(raw).trim();
    return formatted || "Unassigned";
  }, [transaction]);

  useEffect(() => {
    let cancelled = false;
    const officeId = transaction?.office?.trim() ?? "";
    if (!officeId) {
      setChecklistTemplates([]);
      setIsLoadingTemplates(false);
      return () => {
        cancelled = true;
      };
    }
    async function load() {
      setIsLoadingTemplates(true);
      try {
        const templates = await fetchOfficeChecklistTemplatesForTransactionSelect(officeId);
        if (!cancelled) setChecklistTemplates(templates);
      } finally {
        if (!cancelled) setIsLoadingTemplates(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [transaction?.office]);

  useEffect(() => {
    const oid = transaction?.office?.trim() ?? "";
    if (!oid) {
      setOfficeDisplayLabel("");
      return;
    }
    setOfficeDisplayLabel(undefined);
    let cancelled = false;
    void getOfficeById(oid).then((office) => {
      if (cancelled) return;
      if (!office) {
        setOfficeDisplayLabel(oid);
        return;
      }
      const label = (office.display_name ?? office.name).trim() || office.name;
      setOfficeDisplayLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [transaction?.office]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void countChecklistItemsForTransaction(id).then((n) => {
      if (!cancelled) setChecklistMaterialized(n > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!checklistTemplateId || !id) {
      if (!checklistTemplateId) setChecklistItems([]);
      return;
    }
    const templateId = checklistTemplateId;
    const transactionId = id;
    let cancelled = false;
    async function loadChecklist() {
      await ensureChecklistItemsForTransaction(transactionId, templateId);
      const cnt = await countChecklistItemsForTransaction(transactionId);
      if (!cancelled) setChecklistMaterialized(cnt > 0);
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(transactionId, templateId),
        fetchCommentsByTransactionId(transactionId),
      ]);
      if (!cancelled) {
        const withComments: ChecklistItem[] = items.map((item) => ({
          ...item,
          comments: commentsByItem.get(String(item.id)) ?? [],
        })) as ChecklistItem[];
        setChecklistItems(
          mergeInboxIntoChecklistItems(withComments, inboxDocumentsRef.current)
        );
      }
    }
    void loadChecklist();
    return () => {
      cancelled = true;
    };
    // inboxDocuments merged in the effect below so inbox refreshes do not re-run template seeding.
  }, [checklistTemplateId, id]);

  useEffect(() => {
    setChecklistItems((prev) => mergeInboxIntoChecklistItems(prev, inboxDocuments));
  }, [inboxDocuments]);

  const isReadOnly = transactionStatus === "Archived";

  async function handleSaveTransactionControls() {
    if (!id || isReadOnly) return;
    const user = await getCurrentUser();
    const row = transaction as TransactionRow | null;
    const claimAgent =
      currentUserRole === "Agent" &&
      user?.id &&
      row &&
      (row.agent_user_id == null || String(row.agent_user_id).trim() === "");

    const { data: updated, error } = await updateTransaction(id, {
      status: transactionStatus || null,
      closingDate: closingDate || null,
      ...(claimAgent ? { agentUserId: user.id } : {}),
    });
    if (error || !updated) {
      console.error("[handleSaveTransactionControls]", error);
      toast.error(error?.message ?? "Could not save transaction");
      return;
    }
    await reloadTransaction();
    toast.success("Saved");
  }

  function handleStatusChange(status: TransactionStatus) {
    setTransactionStatus(status);
  }

  function handleClosingDateChange(date: string) {
    setClosingDate(date);
  }

  async function handleChecklistTemplateSelect(templateId: string) {
    if (!id || isSavingChecklist) return;
    if (checklistMaterialized) {
      toast.error("Checklist is already in use. Template cannot be changed.");
      return;
    }
    setIsSavingChecklist(true);
    try {
      const { error } = await updateTransaction(id, { checklistTemplateId: templateId });
      if (error) {
        console.error("[handleChecklistTemplateSelect]", error);
        toast.error(error.message);
        return;
      }
      await replaceChecklistItemsFromTemplate(id, templateId);
      const n = await countChecklistItemsForTransaction(id);
      setChecklistMaterialized(n > 0);
      await reloadTransaction();
    } finally {
      setIsSavingChecklist(false);
    }
  }

  async function handleAddCustomChecklistItem(args: {
    templateSectionId: string;
    name: string;
    required: boolean;
  }) {
    if (!id || !checklistTemplateId) {
      throw new Error("Missing transaction id or checklist template id");
    }
    try {
      await insertCustomChecklistItem({
        transactionId: id,
        templateId: checklistTemplateId,
        templateSectionId: args.templateSectionId,
        name: args.name,
        required: args.required,
      });
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(id, checklistTemplateId),
        fetchCommentsByTransactionId(id),
      ]);
      const withComments: ChecklistItem[] = items.map((item) => ({
        ...item,
        comments: commentsByItem.get(String(item.id)) ?? [],
      })) as ChecklistItem[];
      setChecklistItems(mergeInboxIntoChecklistItems(withComments, inboxDocumentsRef.current));
      toast.success("Checklist item added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add checklist item");
      throw e;
    }
  }

  async function handleArchiveChecklistItem(item: ChecklistItem) {
    if (!id || !checklistTemplateId) {
      toast.error("Missing transaction or checklist");
      return;
    }
    try {
      await archiveChecklistItem({ transactionId: id, checklistItemId: item.id });
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(id, checklistTemplateId),
        fetchCommentsByTransactionId(id),
      ]);
      const withComments: ChecklistItem[] = items.map((row) => ({
        ...row,
        comments: commentsByItem.get(String(row.id)) ?? [],
      })) as ChecklistItem[];
      setChecklistItems(mergeInboxIntoChecklistItems(withComments, inboxDocumentsRef.current));
      toast.success("Checklist item archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive checklist item");
      throw e;
    }
  }

  async function handleRestoreChecklistItem(item: ChecklistItem) {
    if (!id || !checklistTemplateId) {
      toast.error("Missing transaction or checklist");
      return;
    }
    try {
      await restoreChecklistItem({ transactionId: id, checklistItemId: item.id });
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(id, checklistTemplateId),
        fetchCommentsByTransactionId(id),
      ]);
      const withComments: ChecklistItem[] = items.map((row) => ({
        ...row,
        comments: commentsByItem.get(String(row.id)) ?? [],
      })) as ChecklistItem[];
      setChecklistItems(mergeInboxIntoChecklistItems(withComments, inboxDocumentsRef.current));
      toast.success("Checklist item restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restore checklist item");
      throw e;
    }
  }

  function handleOpenArchiveModal() {
    if (transactionStatus !== "Closed") return;
    const confirmed = window.confirm(
      "Archive this transaction? It will become read-only. Download the Archive Package for your records."
    );
    if (!confirmed) return;
    const txn = transaction as TransactionRow & { identifier?: string; office?: string; agent?: string };
    const activeForReadiness = checklistItems.filter((i) => !i.archivedAt);
    const engineDocs = activeForReadiness.map((item) =>
      checklistItemForControlsToEngineDocument(item)
    );
    const readiness = getTransactionClosingReadiness(engineDocs);
    setArchiveMetadata({
      archivedAt: new Date(),
      archivedBy: { name: "Current User", role: currentUserRole },
      archiveReceipt: {
        transactionSummary: {
          identifier: txn?.identifier ?? "Unknown",
          id: id ?? "Unknown",
          office: txn?.office ?? "Unknown Office",
          assignedAgent: txn?.agent ?? "—",
          status: "Closed",
        },
        documentSummary: {
          requiredComplete: readiness.acceptedRequiredCount - (readiness.waivedRequiredCount ?? 0),
          requiredWaived: readiness.waivedRequiredCount ?? 0,
          optionalComplete: activeForReadiness.filter(
            (i) => i.requirement === "optional" && i.reviewStatus === "complete"
          ).length,
          totalDocuments: activeForReadiness.length,
        },
        activityLogCount: 0,
      },
      archivedActivityLog: [],
    });
    setTransactionStatus("Archived");
  }

  function handleDownloadArchivePackage() {
    const pkg = {
      transaction: { id, status: transactionStatus, closingDate, contractDate, assignedAdmin },
      archivedMetadata: archiveMetadata,
      archivedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-${id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-5">
        <Card className="mx-auto max-w-[1080px] border-slate-200 shadow-sm">
          <CardContent className="py-8 text-sm text-slate-600">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-slate-50 p-5">
        <div className="mx-auto max-w-[1080px] space-y-4">
          <Button variant="outline" onClick={() => window.history.back()}>
            Back
          </Button>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="py-10 text-center text-sm text-slate-600">
              Not found.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const title =
    (transaction.identifier && String(transaction.identifier).trim()) ||
    `Transaction ${transaction.id}`;

  const officeValue =
    !transaction.office?.trim()
      ? "—"
      : officeDisplayLabel === undefined
        ? "…"
        : officeDisplayLabel;

  const intakeEmail = transaction.intake_email ?? null;

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
        <TransactionOverview
          row={transaction}
          title={title}
          officeValue={officeValue}
          agentDisplayName={assignedAgentName}
          formatCurrency={formatCurrency}
          onSave={() => {
            void handleSaveTransactionControls();
          }}
          onOpenZipFormsLaunch={() => setZipFormsLaunchOpen(true)}
          onOpenDotloopLaunch={() => setDotloopLaunchOpen(true)}
          onEdit={handleEdit}
        />

        <FormsEngineLaunchDialog
          variant="zipforms"
          open={zipFormsLaunchOpen}
          onOpenChange={setZipFormsLaunchOpen}
          intakeEmail={intakeEmail}
        />
        <FormsEngineLaunchDialog
          variant="dotloop"
          open={dotloopLaunchOpen}
          onOpenChange={setDotloopLaunchOpen}
          intakeEmail={intakeEmail}
        />

        <TransactionControls
          transactionStatus={transactionStatus}
          assignedAdmin={assignedAdmin}
          closingDate={closingDate}
          checklistItems={checklistItems}
          isReadOnly={isReadOnly}
          currentUserRole={currentUserRole}
          archiveMetadata={archiveMetadata}
          onStatusChange={handleStatusChange}
          onClosingDateChange={handleClosingDateChange}
          onOpenArchiveModal={handleOpenArchiveModal}
          onDownloadArchivePackage={handleDownloadArchivePackage}
          onViewArchivedActivityLog={() => {}}
          intakeEmail={intakeEmail}
          onCopyIntakeEmail={handleCopyIntakeEmail}
        />

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Documents</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload files to the inbox, then attach them to checklist items.
            </p>
          </div>
          <TransactionInbox
            transactionId={id}
            inboxDocuments={inboxDocuments}
            onInboxDocumentsChange={setInboxDocuments}
            checklistItems={checklistItems}
            onChecklistItemsChange={setChecklistItems}
            addActivityEntry={addActivityEntry}
            currentUserRole={currentUserRole}
            isReadOnly={isReadOnly}
            attachDrawerOpen={attachDrawerOpen}
            attachTargetItem={attachTargetItem}
            onAttachDrawerOpenChange={handleAttachDrawerOpenChange}
            onAttachTargetChange={setAttachTargetItem}
          />
        </div>

        <Checklist
          checklistTemplateId={checklistTemplateId}
          checklistTemplates={checklistTemplates}
          isLoadingTemplates={isLoadingTemplates}
          isSavingChecklist={isSavingChecklist}
          templateSwitchDisabled={checklistMaterialized || isReadOnly}
          onChecklistTemplateSelect={handleChecklistTemplateSelect}
          checklistItems={checklistItems}
          onChecklistItemsChange={setChecklistItems}
          inboxDocuments={inboxDocuments}
          onInboxDocumentsChange={setInboxDocuments}
          transactionContext={
            transaction && id
              ? {
                  id,
                  officeId: (transaction as TransactionRow & { office?: string }).office ?? "",
                  agentUserId: (transaction as TransactionRow).agent_user_id ?? null,
                  assignedAdminUserId: getAssignedAdminUserId(transaction as TransactionRow),
                  closingDate: (transaction as TransactionRow).closing_date ?? null,
                }
              : null
          }
          currentUserId={sessionUserId}
          currentUserRole={currentUserRole}
          isReadOnly={isReadOnly}
          addActivityEntry={addActivityEntry}
          onOpenAttachDrawer={handleOpenAttachDrawer}
          onOpenComments={handleOpenComments}
          onOpenReviewModal={handleOpenReviewModal}
          onRenameChecklistItem={isReadOnly ? undefined : handleRenameChecklistItem}
          onAddCustomChecklistItem={isReadOnly ? undefined : handleAddCustomChecklistItem}
          onArchiveChecklistItem={isReadOnly ? undefined : handleArchiveChecklistItem}
          onRestoreChecklistItem={isReadOnly ? undefined : handleRestoreChecklistItem}
        />

        <TransactionActivity
          activityEntries={activityLog}
          currentActivityFilter={activityFilter}
          onActivityFilterChange={setActivityFilter}
        />

        {/* Admin Review Workspace — split-view document + comments */}
        <Dialog
          open={isReviewModalOpen}
          onOpenChange={(open) => {
            setIsReviewModalOpen(open);
            if (!open) {
              setSelectedItem(null);
              setReviewDocUrl(null);
            }
          }}
        >
          <DialogContent
            fullScreen
            overlayClassName="z-[9998]"
            className="w-screen h-screen max-w-none max-h-none rounded-none border-0 p-0 m-0 flex flex-col overflow-hidden z-[9999] bg-white [&>button:last-child]:hidden"
          >
            <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <div>
                <DialogTitle>Review Document — {selectedItem?.name}</DialogTitle>
                <DialogDescription>
                  Document preview and comments side by side
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReviewModalOpen(false)}
                className="flex-shrink-0 font-medium ring-1 ring-slate-300"
              >
                Close
              </Button>
            </DialogHeader>

            {selectedItem && (
              <div className="flex-1 flex min-h-0">
                {/* Left: Document preview — 65% */}
                <div className="w-[65%] h-full overflow-y-auto flex flex-col flex-shrink-0 border-r-2 border-slate-300 bg-slate-100">
                  <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {selectedItem.attachedDocument?.filename ?? "Document"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenReviewDocInNewTab}
                      className="flex-shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in new tab
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto p-4">
                    {reviewDocUrlLoading && (
                      <div className="flex items-center justify-center h-full text-slate-500">
                        Loading document…
                      </div>
                    )}
                    {reviewDocUrlError && (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                        <AlertTriangle className="h-12 w-12 text-amber-500" />
                        <p>Could not load document preview.</p>
                        <Button variant="outline" onClick={handleOpenReviewDocInNewTab}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in new tab
                        </Button>
                      </div>
                    )}
                    {reviewDocUrl && !reviewDocUrlLoading && !reviewDocUrlError && (
                      <div className="bg-white rounded-lg shadow-sm overflow-hidden h-full min-h-[400px]">
                        {(() => {
                          const kind = getReviewInlinePreviewKind(
                            selectedItem.attachedDocument?.storage_path,
                            selectedItem.attachedDocument?.filename
                          );
                          return kind === "pdf" ? (
                            <iframe
                              src={reviewDocUrl}
                              title={selectedItem.attachedDocument?.filename ?? "Document"}
                              className="w-full h-full border-0"
                            />
                          ) : kind === "image" ? (
                            <img
                              src={reviewDocUrl}
                              alt={selectedItem.attachedDocument?.filename ?? "Document"}
                              className="max-w-full h-auto object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-slate-600">
                              <p>Preview not available for this file type.</p>
                              <Button variant="outline" onClick={handleOpenReviewDocInNewTab}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open in new tab
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {!selectedItem.attachedDocument && (
                      <div className="flex items-center justify-center h-full text-slate-500">
                        No document attached
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Status + Comments — 35% */}
                <div className="w-[35%] h-full overflow-y-auto flex-shrink-0 flex flex-col border-l border-[#e5e7eb] bg-white">
                  <div className="p-4 space-y-4 border-b border-slate-200">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">Requirement</Label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setReviewRequirement("required")}
                          className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewRequirement === "required"
                              ? "border-blue-600 bg-blue-50 text-blue-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Required
                        </button>
                        <button
                          onClick={() => setReviewRequirement("optional")}
                          className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewRequirement === "optional"
                              ? "border-slate-600 bg-slate-50 text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Optional
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium text-slate-700">Status</Label>
                        <span className="text-xs font-medium text-slate-500">
                          Current: <span className="text-slate-700 capitalize">{reviewStatus}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => { setReviewStatus("pending"); setNotifyAgent(false); }}
                          disabled={!selectedItem.attachedDocument || !reviewModalPermissions.canReview}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewStatus === "pending"
                              ? "border-amber-600 bg-amber-50 text-amber-900"
                              : !selectedItem.attachedDocument
                                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Pending
                        </button>
                        {reviewModalPermissions.canMarkAccepted && (
                        <button
                          onClick={() => {
                            setReviewStatus("complete");
                            setNotifyAgent(false);
                            toast.success("Status set to Complete");
                          }}
                          disabled={!selectedItem.attachedDocument}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewStatus === "complete"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                              : !selectedItem.attachedDocument
                                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Mark Accepted
                        </button>
                        )}
                        {reviewModalPermissions.canReview && (
                        <button
                          onClick={() => { setReviewStatus("rejected"); setNotifyAgent(true); }}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewStatus === "rejected"
                              ? "border-red-600 bg-red-50 text-red-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Rejected
                        </button>
                        )}
                        {reviewModalPermissions.canReview && (
                        <button
                          onClick={() => { setReviewStatus("waived"); setNotifyAgent(false); }}
                          className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                            reviewStatus === "waived"
                              ? "border-slate-600 bg-slate-50 text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          Waived
                        </button>
                        )}
                      </div>
                    </div>
                    {reviewStatus === "rejected" && (
                      <div>
                        <Label htmlFor="reviewNote" className="text-sm font-medium text-slate-700">
                          Rejection Reason <span className="text-red-600">*</span>
                        </Label>
                        <Textarea
                          id="reviewNote"
                          placeholder="Explain what needs to be fixed..."
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          className="mt-1.5 min-h-[80px]"
                        />
                        <div className="flex items-start gap-2 mt-2">
                          <Checkbox
                            id="notifyAgent"
                            checked={notifyAgent}
                            onCheckedChange={(checked) => setNotifyAgent(checked === true)}
                          />
                          <label htmlFor="notifyAgent" className="text-sm text-slate-700 cursor-pointer">
                            Notify Agent
                          </label>
                        </div>
                      </div>
                    )}
                    {reviewStatus === "waived" && (
                      <div>
                        <Label htmlFor="waivedReason" className="text-sm font-medium text-slate-700">
                          Waived Reason <span className="text-red-600">*</span>
                        </Label>
                        <Input
                          id="waivedReason"
                          placeholder="e.g., Property is not in an HOA"
                          value={waivedReason}
                          onChange={(e) => setWaivedReason(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    )}
                  </div>

                  {/* Comments thread */}
                  <div className="flex-1 p-5 space-y-4 min-h-0 overflow-y-auto">
                    <Label className="text-sm font-medium text-slate-700">Comments</Label>
                    <div className="space-y-4">
                      {(selectedItem.comments?.length ?? 0) === 0 && (
                        <p className="text-sm text-slate-500 py-2">No comments yet.</p>
                      )}
                      {((selectedItem.comments ?? []) as CommentShape[])
                        .filter(
                          (c) =>
                            currentUserRole === "Admin" ||
                            currentUserRole === "Broker" ||
                            c.visibility === "Shared"
                        )
                        .map((comment) => (
                          <div
                            key={comment.id}
                            className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
                          >
                            {(comment.pageNumber ?? comment.locationNote) && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {comment.pageNumber && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    Page {comment.pageNumber}
                                  </span>
                                )}
                                {comment.locationNote && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                    {comment.locationNote}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-2">
                              <span className="font-medium text-slate-800">{comment.authorName}</span>
                              <Badge className="bg-slate-600 text-white border-0 text-xs h-4 px-1.5">
                                {comment.authorRole}
                              </Badge>
                              <span className="text-slate-400">{formatRelativeTime(comment.createdAt)}</span>
                            </div>
                            <p className="text-sm text-slate-900 leading-relaxed">{comment.message}</p>
                          </div>
                        ))}
                      <div ref={reviewCommentsEndRef} />
                    </div>

                    {/* Add comment form */}
                    <div className="mt-6 p-4 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 space-y-3">
                      <Label className="text-sm font-medium text-slate-700">Add comment</Label>
                      <Textarea
                        placeholder="Type your comment..."
                        value={reviewCommentText}
                        onChange={(e) => setReviewCommentText(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                      <Button
                        onClick={handlePostReviewComment}
                        disabled={!reviewCommentText.trim()}
                        className="w-full"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Post Comment
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-shrink-0 flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
              <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveReview}>
                <Save className="h-4 w-4 mr-2" />
                Save Review
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Comments Thread Drawer */}
        <Sheet open={isCommentsDrawerOpen} onOpenChange={setIsCommentsDrawerOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Document Thread — {commentsTargetItem?.name}</SheetTitle>
              <SheetDescription>
                Conversation between Admin and Agent about this document
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-2">
                {commentsTargetItem && (commentsTargetItem.comments?.length ?? 0) === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No comments yet. Start the conversation!</p>
                  </div>
                )}
                {((commentsTargetItem?.comments ?? []) as CommentShape[])
                  .filter((comment) => {
                    if (currentUserRole === "Agent") return comment.visibility === "Shared";
                    if (currentUserRole === "Broker") {
                      return (
                        comment.authorRole === "Broker" ||
                        comment.authorRole === "Admin" ||
                        comment.visibility === "Shared"
                      );
                    }
                    return true;
                  })
                  .map((comment) => (
                    <div
                      key={comment.id}
                      className={`flex gap-3 ${
                        comment.authorRole === "Admin" || comment.authorRole === "Broker"
                          ? "flex-row"
                          : "flex-row-reverse"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          comment.authorRole === "Admin" || comment.authorRole === "Broker"
                            ? "bg-slate-700 text-white"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {comment.authorName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div
                        className={`flex-1 max-w-[80%] ${
                          comment.authorRole === "Admin" || comment.authorRole === "Broker"
                            ? "text-left"
                            : "text-right"
                        }`}
                      >
                        <div
                          className={`inline-block p-3 rounded-lg ${
                            comment.authorRole === "Admin" || comment.authorRole === "Broker"
                              ? "bg-slate-100 text-slate-900"
                              : "bg-blue-50 text-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{comment.authorName}</span>
                            <Badge
                              className={`text-xs h-5 ${
                                comment.authorRole === "Admin" || comment.authorRole === "Broker"
                                  ? "bg-slate-600 text-white border-0"
                                  : "bg-blue-600 text-white border-0"
                              }`}
                            >
                              {comment.authorRole}
                            </Badge>
                            {comment.visibility === "Internal" && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs h-5">
                                Internal
                              </Badge>
                            )}
                            {comment.type === "StatusChange" && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs h-5">
                                Status Change
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{comment.message}</p>
                          <div className="text-xs text-slate-500 mt-1.5">
                            {formatRelativeTime(comment.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {isReadOnly ? (
                <div className="border-t pt-4">
                  <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-600">
                      <Archive className="h-4 w-4 inline mr-1" />
                      This transaction is archived. Comments are read-only.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4 space-y-3">
                  <Label htmlFor="new-comment" className="text-sm font-medium text-slate-700">
                    Add Comment
                  </Label>
                  <Textarea
                    id="new-comment"
                    placeholder="Type your message..."
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="share-with-agent"
                        checked={commentVisibility === "Shared"}
                        onCheckedChange={(checked) => setCommentVisibility(checked ? "Shared" : "Internal")}
                      />
                      <Label htmlFor="share-with-agent" className="text-sm text-slate-700 font-normal cursor-pointer">
                        Shared with Agent
                        {commentVisibility === "Internal" && (
                          <span className="ml-2 text-xs text-amber-600 font-medium">(Internal only)</span>
                        )}
                      </Label>
                    </div>
                    {commentVisibility === "Shared" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-agent-comment"
                          checked={notifyAgentOnComment}
                          onCheckedChange={(checked) => setNotifyAgentOnComment(checked === true)}
                        />
                        <Label
                          htmlFor="notify-agent-comment"
                          className="text-sm text-slate-700 font-normal cursor-pointer"
                        >
                          Notify Agent
                        </Label>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handlePostComment}
                    className="w-full"
                    disabled={!newCommentText.trim()}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Post Comment
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}