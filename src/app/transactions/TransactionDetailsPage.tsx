import { useEffect, useMemo, useState } from "react";
import React from "react";
import { toast } from "sonner";
import { MessageSquare, Save, Archive, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
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
import { getTransaction, updateTransaction, type TransactionRow } from "../../services/transactions";
import { getCurrentUser } from "../../services/auth";
import {
  fetchChecklistTemplates,
  fetchChecklistItemsByTemplateId,
  type ChecklistTemplate,
} from "../../services/checklistTemplates";
import TransactionOverview from "./sections/TransactionOverview";
import TransactionInbox from "./sections/TransactionInbox";
import TransactionControls from "./sections/TransactionControls";
import GeneratedIntakeEmail from "./sections/GeneratedIntakeEmail";
import TransactionActivity from "./sections/TransactionActivity";
import Checklist from "./sections/Checklist";
import type { ChecklistItem, InboxDocument } from "./sections/TransactionInbox";
import type { ArchiveMetadata, TransactionStatus } from "./sections/TransactionControls";
import type { ActivityLogEntry, ActivityFilter } from "./sections/TransactionActivity";

type CommentShape = {
  id: string;
  authorRole: "Admin" | "Agent";
  authorName: string;
  createdAt: Date;
  message: string;
  visibility: "Internal" | "Shared";
  type?: "Comment" | "StatusChange" | "System";
  unread?: { Admin?: boolean; Agent?: boolean };
};
function handleSave() {
  window.location.href = "/transactions";
}

function handleLaunchZipForms() {
  alert("ZipForms launch coming soon");
}

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

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function SummaryField({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value?: string | number | null;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 16,
        background: "#f8fafc",
        gridColumn: fullWidth ? "span 2" : "span 1",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function TransactionDetailsPage() {
  const id = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [inboxDocuments, setInboxDocuments] = useState<InboxDocument[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

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

  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [reviewRequirement, setReviewRequirement] = useState<"required" | "optional">("required");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "rejected" | "complete" | "waived">("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [waivedReason, setWaivedReason] = useState("");
  const [notifyAgent, setNotifyAgent] = useState(true);

  const [currentUserName, setCurrentUserName] = useState<string>("Current User");
  const currentUserRole = "Admin" as "Admin" | "Agent";

  function addActivityEntry(entry: Omit<ActivityLogEntry, "id" | "timestamp">) {
    const newEntry: ActivityLogEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry,
    };
    setActivityLog((prev) => [newEntry, ...prev]);
  }

  function handleOpenAttachDrawer(item?: ChecklistItem) {
    setAttachTargetItem(item ?? null);
    setAttachDrawerOpen(true);
  }

  function handleAttachDrawerOpenChange(open: boolean) {
    setAttachDrawerOpen(open);
    if (!open) setAttachTargetItem(null);
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

  function handlePostComment() {
    if (!commentsTargetItem || !newCommentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }
    const comments = (commentsTargetItem.comments ?? []) as CommentShape[];
    const newComment: CommentShape = {
      id: `comment-${commentsTargetItem.id}-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      createdAt: new Date(),
      message: newCommentText.trim(),
      visibility: commentVisibility,
      type: "Comment",
      unread: {
        Admin: currentUserRole === "Agent",
        Agent: currentUserRole === "Admin" && commentVisibility === "Shared",
      },
    };
    const updatedComments = [...comments, newComment];
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
    });
    if (currentUserRole === "Admin" && commentVisibility === "Shared" && notifyAgentOnComment) {
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: "AGENT_NOTIFIED",
        message: `Notification sent to Agent: ${assignedAgentName} — New comment on ${commentsTargetItem.name}`,
        meta: { agentName: assignedAgentName, checklistItem: commentsTargetItem.name, notificationType: "comment" },
      });
      toast.success("Agent notified (demo)");
    }
    setNewCommentText("");
    toast.success("Comment posted");
  }

  function handleOpenReviewModal(item: ChecklistItem) {
    setSelectedItem(item);
    setReviewRequirement(item.requirement);
    setReviewStatus(item.reviewStatus);
    setReviewNote("");
    setWaivedReason("");
    setNotifyAgent(true);
    setIsReviewModalOpen(true);
  }

  function handleSaveReview() {
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

    const comments = (selectedItem.comments ?? []) as CommentShape[];
    const updatedComments = [...comments];
    if (reviewStatus === "rejected" && reviewNote.trim()) {
      updatedComments.push({
        id: `comment-${selectedItem.id}-${Date.now()}`,
        authorRole: "Admin",
        authorName: currentUserName,
        createdAt: new Date(),
        message: `Rejected: ${reviewNote.trim()}`,
        visibility: "Shared",
        type: "StatusChange",
        unread: { Agent: true },
      });
    } else if (reviewStatus === "waived" && waivedReason.trim()) {
      updatedComments.push({
        id: `comment-${selectedItem.id}-${Date.now()}`,
        authorRole: "Admin",
        authorName: currentUserName,
        createdAt: new Date(),
        message: `Waived: ${waivedReason.trim()}`,
        visibility: "Shared",
        type: "StatusChange",
        unread: { Agent: true },
      });
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
        actor: "Admin",
        category: "docs",
        type: "CHECKLIST_ITEM_REQUIREMENT_CHANGED",
        message: `Admin marked "${selectedItem.name}" as ${reviewRequirement === "required" ? "Required" : "Optional"}`,
        meta: {
          docName: selectedItem.name,
          fromRequirement: selectedItem.requirement,
          toRequirement: reviewRequirement,
        },
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

    if (notifyAgent && reviewStatus === "rejected") {
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: "AGENT_NOTIFIED",
        message: `Notification sent to Agent: ${assignedAgentName} — Document rejected: ${selectedItem.name}`,
        meta: { agentName: assignedAgentName, checklistItem: selectedItem.name, notificationType: "rejection" },
      });
      toast.success("Agent notified (demo)");
    }

    toast.success("Review saved successfully");
    setIsReviewModalOpen(false);
    setSelectedItem(null);
  }

  function handleEdit() {
    window.location.href = `/transactions/${id}/edit`;
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

        const data = await getTransaction(id);

        if (!cancelled) {
          setTransaction(data);
          if (data) {
            const s = data.status as string;
            const valid: TransactionStatus[] = ["Pre-Contract", "Under Contract", "Closed", "Archived"];
            setTransactionStatus(valid.includes(s as TransactionStatus) ? (s as TransactionStatus) : "Pre-Contract");
            setAssignedAdmin(data.assignedadmin ?? null);
            setClosingDate(data.closingdate ?? null);
            setContractDate(data.contractdate ?? null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) {
        setCurrentUserName(user?.email ?? "Current User");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const checklistTemplateId = transaction?.checklist_template_id?.trim() || null;
  const assignedAgentName =
    (transaction as TransactionRow & { listagent?: string; buyeragent?: string })?.listagent ??
    (transaction as TransactionRow & { listagent?: string; buyeragent?: string })?.buyeragent ??
    "Unassigned";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoadingTemplates(true);
      try {
        const templates = await fetchChecklistTemplates();
        if (!cancelled) setChecklistTemplates(templates);
      } finally {
        if (!cancelled) setIsLoadingTemplates(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!checklistTemplateId) {
      setChecklistItems([]);
      return;
    }
    const templateId = checklistTemplateId;
    let cancelled = false;
    async function loadChecklist() {
      const items = await fetchChecklistItemsByTemplateId(templateId);
      if (!cancelled) setChecklistItems(items);
    }
    loadChecklist();
    return () => { cancelled = true; };
  }, [checklistTemplateId]);

  async function handleCopy(text?: string | null) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard");
    } catch {
      alert("Copy failed");
    }
  }

  const isReadOnly = transactionStatus === "Archived";

  function handleStatusChange(status: TransactionStatus) {
    setTransactionStatus(status);
  }

  function handleAssignedAdminChange(admin: string) {
    setAssignedAdmin(admin);
  }

  function handleClosingDateChange(date: string) {
    setClosingDate(date);
  }

  function handleContractDateChange(date: string) {
    setContractDate(date);
  }

  async function handleChecklistTemplateSelect(templateId: string) {
    if (!id || isSavingChecklist) return;
    setIsSavingChecklist(true);
    // Optimistic update: immediately update page state so checklistTemplateId and items populate
    // even if persist fails (e.g. RLS). User sees the checklist; persist is best-effort.
    setTransaction((prev) =>
      prev ? { ...prev, checklist_template_id: templateId } : null
    );
    const items = await fetchChecklistItemsByTemplateId(templateId);
    setChecklistItems(items);
    const updated = await updateTransaction(id, { checklistTemplateId: templateId });
    if (updated) {
      setTransaction(updated);
    }
    setIsSavingChecklist(false);
  }

  function handleOpenArchiveModal() {
    if (transactionStatus !== "Closed") return;
    const confirmed = window.confirm(
      "Archive this transaction? It will become read-only. Download the Archive Package for your records."
    );
    if (!confirmed) return;
    const txn = transaction as TransactionRow & { identifier?: string; office?: string; agent?: string };
    setArchiveMetadata({
      archivedAt: new Date(),
      archivedBy: { name: "Current User", role: "Admin" },
      archiveReceipt: {
        transactionSummary: {
          identifier: txn?.identifier ?? "Unknown",
          id: id ?? "Unknown",
          office: txn?.office ?? "Unknown Office",
          assignedAgent: txn?.agent ?? "—",
          status: "Closed",
        },
        documentSummary: {
          requiredComplete: checklistItems.filter((i) => i.requirement === "required" && i.reviewStatus === "complete").length,
          requiredWaived: checklistItems.filter((i) => i.requirement === "required" && i.reviewStatus === "waived").length,
          optionalComplete: checklistItems.filter((i) => i.requirement === "optional" && i.reviewStatus === "complete").length,
          totalDocuments: checklistItems.length,
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
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!transaction) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Button variant="outline" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
        <div>Not found.</div>
      </div>
    );
  }

  const row = transaction as TransactionRow & {
    identifier?: string | null;
    address?: string | null;
    address_identifier?: string | null;
    client?: string | null;
    client_name?: string | null;
    checklist_type?: string | null;
    office?: string | null;
    office_name?: string | null;
    assigned_admin?: string | null;
    intake_email?: string | null;
    sale_price?: number | string | null;
    status?: string | null;
    type?: string | null;
  };

  const title =
    row.address_identifier ||
    row.address ||
    row.identifier ||
    `Transaction ${row.id}`;

  const clientValue = row.client_name || row.client || "—";
  const officeValue = row.office_name || row.office || "—";

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 32 }}>
        <TransactionOverview
          row={row}
          title={title}
          clientValue={clientValue}
          officeValue={officeValue}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
          onSave={handleSave}
          onLaunchZipForms={handleLaunchZipForms}
          onEdit={handleEdit}
          onCopyIntakeEmail={handleCopy}
        />

        <TransactionControls
          transactionStatus={transactionStatus}
          assignedAdmin={assignedAdmin}
          closingDate={closingDate}
          contractDate={contractDate}
          checklistItems={checklistItems}
          isReadOnly={isReadOnly}
          currentUserRole="Admin"
          archiveMetadata={archiveMetadata}
          onStatusChange={handleStatusChange}
          onAssignedAdminChange={handleAssignedAdminChange}
          onClosingDateChange={handleClosingDateChange}
          onContractDateChange={handleContractDateChange}
          onOpenArchiveModal={handleOpenArchiveModal}
          onDownloadArchivePackage={handleDownloadArchivePackage}
          onViewArchivedActivityLog={() => {}}
        />

        <GeneratedIntakeEmail intakeEmail={row.intake_email} />

        <TransactionInbox
          transactionId={id}
          inboxDocuments={inboxDocuments}
          onInboxDocumentsChange={setInboxDocuments}
          checklistItems={checklistItems}
          onChecklistItemsChange={setChecklistItems}
          addActivityEntry={addActivityEntry}
          currentUserRole="Admin"
          attachDrawerOpen={attachDrawerOpen}
          attachTargetItem={attachTargetItem}
          onAttachDrawerOpenChange={handleAttachDrawerOpenChange}
          onAttachTargetChange={setAttachTargetItem}
        />

        <Checklist
          checklistTemplateId={checklistTemplateId}
          checklistTemplates={checklistTemplates}
          isLoadingTemplates={isLoadingTemplates}
          isSavingChecklist={isSavingChecklist}
          onChecklistTemplateSelect={handleChecklistTemplateSelect}
          checklistItems={checklistItems}
          onChecklistItemsChange={setChecklistItems}
          inboxDocuments={inboxDocuments}
          onInboxDocumentsChange={setInboxDocuments}
          currentUserRole="Admin"
          isReadOnly={isReadOnly}
          addActivityEntry={addActivityEntry}
          onOpenAttachDrawer={handleOpenAttachDrawer}
          onOpenComments={handleOpenComments}
          onOpenReviewModal={handleOpenReviewModal}
        />

        <TransactionActivity
          activityEntries={activityLog}
          currentActivityFilter={activityFilter}
          onActivityFilterChange={setActivityFilter}
        />

        {/* Admin Review Modal */}
        <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Document</DialogTitle>
              <DialogDescription>
                Review and update the status of &quot;{selectedItem?.name}&quot;
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-6 py-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Document Name</Label>
                  <div className="mt-1.5 text-lg font-semibold text-slate-900">{selectedItem.name}</div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Requirement Level</Label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setReviewRequirement("required")}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewRequirement === "required"
                          ? "border-blue-600 bg-blue-50 text-blue-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold">Required</div>
                      <div className="text-xs mt-1 opacity-70">Must be provided</div>
                    </button>
                    <button
                      onClick={() => setReviewRequirement("optional")}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewRequirement === "optional"
                          ? "border-slate-600 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold">Optional</div>
                      <div className="text-xs mt-1 opacity-70">Nice to have</div>
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">Review Status</Label>
                  {!selectedItem.attachedDocument && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        <strong>No attachment:</strong> This item cannot be marked as &quot;Pending Review&quot; or
                        &quot;Complete&quot; without an attached document. Please attach a document first or mark as
                        &quot;Waived&quot;.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        if (!selectedItem.attachedDocument) {
                          toast.error("Cannot set to Pending Review without an attachment");
                          return;
                        }
                        setReviewStatus("pending");
                        setNotifyAgent(false);
                      }}
                      disabled={!selectedItem.attachedDocument}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "pending"
                          ? "border-amber-600 bg-amber-50 text-amber-900"
                          : !selectedItem.attachedDocument
                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Pending Review
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedItem.attachedDocument) {
                          toast.error("Cannot mark as Complete without an attachment");
                          return;
                        }
                        setReviewStatus("complete");
                        setNotifyAgent(false);
                      }}
                      disabled={!selectedItem.attachedDocument}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "complete"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                          : !selectedItem.attachedDocument
                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => {
                        setReviewStatus("rejected");
                        setNotifyAgent(true);
                      }}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "rejected"
                          ? "border-red-600 bg-red-50 text-red-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Rejected
                    </button>
                    <button
                      onClick={() => {
                        setReviewStatus("waived");
                        setNotifyAgent(false);
                      }}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "waived"
                          ? "border-slate-600 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Waived / Not Required
                    </button>
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
                      className="mt-1.5 min-h-[100px]"
                    />
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

                {reviewStatus === "rejected" && (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <Checkbox
                      id="notifyAgent"
                      checked={notifyAgent}
                      onCheckedChange={(checked) => setNotifyAgent(checked === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label htmlFor="notifyAgent" className="text-sm font-medium text-slate-900 cursor-pointer">
                        Notify Agent
                      </label>
                      <p className="text-xs text-slate-600 mt-1">
                        Send notification to the assigned agent about this rejection
                      </p>
                    </div>
                  </div>
                )}

                {(() => {
                  const statusChangeComments = (selectedItem.comments as CommentShape[]).filter(
                    (c) => c.type === "StatusChange"
                  );
                  return statusChangeComments.length > 0 ? (
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">Previous Status Changes</Label>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {statusChangeComments.map((comment) => (
                          <div key={comment.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                              <span className="font-medium">{comment.authorName}</span>
                              <Badge className="bg-slate-600 text-white border-0 text-xs h-4 px-1.5">
                                {comment.authorRole}
                              </Badge>
                              <span className="text-slate-400">•</span>
                              <span>{formatRelativeTime(comment.createdAt)}</span>
                            </div>
                            <p className="text-sm text-slate-900">{comment.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveReview}>
                <Save className="h-4 w-4 mr-2" />
                Save Review
              </Button>
            </DialogFooter>
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
                    return true;
                  })
                  .map((comment) => (
                    <div
                      key={comment.id}
                      className={`flex gap-3 ${
                        comment.authorRole === "Admin" ? "flex-row" : "flex-row-reverse"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          comment.authorRole === "Admin" ? "bg-slate-700 text-white" : "bg-blue-600 text-white"
                        }`}
                      >
                        {comment.authorName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div
                        className={`flex-1 max-w-[80%] ${
                          comment.authorRole === "Admin" ? "text-left" : "text-right"
                        }`}
                      >
                        <div
                          className={`inline-block p-3 rounded-lg ${
                            comment.authorRole === "Admin" ? "bg-slate-100 text-slate-900" : "bg-blue-50 text-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{comment.authorName}</span>
                            <Badge
                              className={`text-xs h-5 ${
                                comment.authorRole === "Admin"
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