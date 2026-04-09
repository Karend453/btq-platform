import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Filter,
  Inbox,
  Paperclip,
  Pencil,
  Scissors,
  Upload,
  Eye,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { cn } from "../components/ui/utils";
import { getTransaction, type TransactionRow } from "../../services/transactions";
import {
  fetchDocumentsByTransactionId,
  attachDocumentToChecklistItem,
  getSignedUrl,
  renameTransactionDocumentDisplayName,
  uploadDocument,
} from "../../services/transactionDocuments";
import {
  ensureChecklistItemsForTransaction,
  fetchChecklistItemsForTransaction,
} from "../../services/checklistItems";
import { fetchCommentsByTransactionId } from "../../services/checklistItemComments";
import { insertActivityEntry } from "../../services/transactionActivity";
import {
  getCurrentUser,
  getTransactionRuntimeRole,
  transactionRuntimeRoleToUiRole,
  type UiTransactionRole,
} from "../../services/auth";
import { useAuth } from "../contexts/AuthContext";
import { ChecklistItemSearchPicker } from "./sections/ChecklistItemSearchPicker";
import type { ChecklistItem, InboxDocument } from "./sections/TransactionInbox";

type InboxFilter = "all" | "unattached" | "recent";

function formatRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) return "Just now";
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
}

/** Align inbox attachment state onto checklist rows (same idea as TransactionDetailsPage). */
function mergeInboxIntoChecklistItems(
  items: ChecklistItem[],
  inboxDocuments: InboxDocument[]
): ChecklistItem[] {
  return items.map((item) => {
    const attached =
      inboxDocuments.find(
        (d) => d.attachedToItemId != null && String(d.attachedToItemId) === String(item.id)
      ) ??
      (item.documentId ? inboxDocuments.find((d) => d.id === item.documentId) : undefined);
    const hasDocId = item.documentId != null && String(item.documentId).trim() !== "";
    const attachedDocument = attached
      ? {
          id: attached.id,
          filename: attached.filename,
          storage_path: attached.storage_path,
          version: 1,
          updatedAt: attached.receivedAt,
        }
      : hasDocId
        ? item.attachedDocument
        : undefined;
    return { ...item, attachedDocument };
  });
}

export default function SplitAssignDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const { user: authUser, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [inboxDocuments, setInboxDocuments] = useState<InboxDocument[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UiTransactionRole>("Admin");
  const [sessionUserId, setSessionUserId] = useState("");

  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("unattached");
  const [attachTargetItem, setAttachTargetItem] = useState<ChecklistItem | null>(null);
  const [selectedDocumentForAttach, setSelectedDocumentForAttach] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const checklistTemplateId = transaction?.checklist_template_id?.trim() || null;
  const isReadOnly = (transaction?.status ?? "").trim().toLowerCase() === "archived";

  useEffect(() => {
    let cancelled = false;
    getTransactionRuntimeRole().then((r) => {
      if (!cancelled) setCurrentUserRole(transactionRuntimeRoleToUiRole(r));
    });
    getCurrentUser().then((user) => {
      if (!cancelled) setSessionUserId(user?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionUserIdResolved = authUser?.id ?? sessionUserId;

  const reloadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setInboxDocuments([]);
    setChecklistItems([]);
    setAttachTargetItem(null);
    setSelectedDocumentForAttach(null);
    try {
      const tx = await getTransaction(id);
      setTransaction(tx);
      const docs = await fetchDocumentsByTransactionId(id);
      setInboxDocuments(docs);

      const templateId = tx?.checklist_template_id?.trim() || null;
      if (!tx || !templateId) {
        setChecklistItems([]);
        return;
      }
      await ensureChecklistItemsForTransaction(id, templateId);
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(id, templateId),
        fetchCommentsByTransactionId(id),
      ]);
      const withComments: ChecklistItem[] = items.map((item) => ({
        ...item,
        comments: commentsByItem.get(String(item.id)) ?? [],
      })) as ChecklistItem[];
      setChecklistItems(mergeInboxIntoChecklistItems(withComments, docs));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useEffect(() => {
    setChecklistItems((prev) => mergeInboxIntoChecklistItems(prev, inboxDocuments));
  }, [inboxDocuments]);

  async function addActivityEntry(entry: {
    actor: "System" | "Agent" | "Admin" | "Broker";
    category: "docs" | "forms" | "system";
    type: string;
    message: string;
    meta?: Record<string, unknown>;
    documentId?: string | null;
    checklistItemId?: string | null;
  }) {
    if (!id || authLoading) return;
    await insertActivityEntry({
      transactionId: id,
      actor: entry.actor,
      category: entry.category,
      type: entry.type,
      message: entry.message,
      meta: entry.meta,
      documentId: entry.documentId ?? null,
      checklistItemId: entry.checklistItemId ?? null,
      actorUserId: sessionUserIdResolved || null,
    });
  }

  const filteredInboxDocuments = useMemo(() => {
    let filtered = inboxDocuments;
    if (inboxFilter === "unattached") {
      filtered = filtered.filter((doc) => !doc.isAttached);
    } else if (inboxFilter === "recent") {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((doc) => doc.receivedAt >= twoDaysAgo);
    }
    return filtered;
  }, [inboxDocuments, inboxFilter]);

  const selectedInboxDocForAttach = selectedDocumentForAttach
    ? inboxDocuments.find((d) => d.id === selectedDocumentForAttach) ?? null
    : null;

  async function handleSaveInboxDocAsLabeled(label: string) {
    const trimmed = label.trim();
    if (!id || !selectedDocumentForAttach || !trimmed) {
      toast.error("Select an unattached document and enter a label");
      return;
    }
    const doc = inboxDocuments.find((d) => d.id === selectedDocumentForAttach);
    if (!doc || doc.isAttached) {
      toast.error("Choose an unattached inbox document to label");
      return;
    }
    const ok = await renameTransactionDocumentDisplayName(id, selectedDocumentForAttach, trimmed);
    if (!ok) {
      toast.error("Could not save label");
      return;
    }
    setInboxDocuments((prev) =>
      prev.map((d) => (d.id === selectedDocumentForAttach ? { ...d, filename: trimmed } : d))
    );
    await addActivityEntry({
      actor: currentUserRole,
      category: "docs",
      type: "document_labeled",
      message: `${currentUserRole} saved an inbox document as “${trimmed}” (not linked to checklist)`,
      meta: { displayName: trimmed },
      documentId: selectedDocumentForAttach,
    });
    toast.success(`Labeled as “${trimmed}” — still in inbox`);
  }

  async function handleAttachDocument() {
    if (!selectedDocumentForAttach) {
      toast.error("Please select a document to attach");
      return;
    }
    if (!attachTargetItem) {
      toast.error("Please select a checklist item");
      return;
    }
    const inboxDoc = inboxDocuments.find((doc) => doc.id === selectedDocumentForAttach);
    if (!inboxDoc) return;

    const isReplacement = !!attachTargetItem.attachedDocument;
    const previousVersion = attachTargetItem.attachedDocument?.version;
    const newVersion = isReplacement ? attachTargetItem.attachedDocument!.version + 1 : 1;
    const previousStatus = attachTargetItem.reviewStatus;
    const previousDocId = attachTargetItem.attachedDocument?.id;

    const attached = await attachDocumentToChecklistItem(inboxDoc.id, attachTargetItem.id);
    if (!attached) {
      toast.error("Failed to save attachment");
      return;
    }
    if (isReplacement && previousDocId) {
      await attachDocumentToChecklistItem(previousDocId, null);
    }

    let newReviewStatus = attachTargetItem.reviewStatus;
    let statusAutoReset = false;
    if (!isReplacement) {
      newReviewStatus = attachTargetItem.reviewStatus === "waived" ? "waived" : "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      newReviewStatus = "pending";
      statusAutoReset = true;
    }

    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === attachTargetItem.id
          ? {
              ...i,
              documentId: inboxDoc.id,
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

    setInboxDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === inboxDoc.id) {
          return { ...doc, isAttached: true, attachedToItemId: attachTargetItem.id };
        }
        if (isReplacement && attachTargetItem.attachedDocument?.id === doc.id) {
          return { ...doc, isAttached: false, attachedToItemId: undefined };
        }
        return doc;
      })
    );

    if (isReplacement) {
      await addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_REPLACED",
        message: `${currentUserRole} replaced document on "${attachTargetItem.name}" (v${previousVersion} → v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: attachTargetItem.name,
          previousVersion,
          newVersion,
        },
        documentId: inboxDoc.id,
        checklistItemId: attachTargetItem.id,
      });
    } else {
      await addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_ATTACHED",
        message: `${currentUserRole} attached "${inboxDoc.filename}" to "${attachTargetItem.name}" (v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: attachTargetItem.name,
          version: newVersion,
        },
        documentId: inboxDoc.id,
        checklistItemId: attachTargetItem.id,
      });
    }
    if (statusAutoReset && attachTargetItem.isComplianceDocument !== false) {
      await addActivityEntry({
        actor: "System",
        category: "docs",
        type: "STATUS_AUTO_RESET",
        message: `Status auto-reset to Pending Review due to new upload on "${attachTargetItem.name}"`,
        meta: {
          checklistItem: attachTargetItem.name,
          previousStatus,
          newStatus: "pending",
        },
        checklistItemId: attachTargetItem.id,
      });
    }

    toast.success(
      isReplacement
        ? `Replaced document on "${attachTargetItem.name}" (v${newVersion})`
        : `Attached "${inboxDoc.filename}" to "${attachTargetItem.name}" (v${newVersion})`
    );
    setAttachTargetItem(null);
    setSelectedDocumentForAttach(null);
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    setIsUploading(true);
    try {
      const doc = await uploadDocument(id, file);
      if (doc) {
        setInboxDocuments((prev) => [doc, ...prev]);
        await addActivityEntry({
          actor: currentUserRole,
          category: "docs",
          type: "document_uploaded",
          message: `Document uploaded: ${doc.filename}`,
          documentId: doc.id,
        });
        toast.success(`Uploaded "${file.name}"`);
      } else {
        toast.error("Upload failed");
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleViewDocument(doc: InboxDocument) {
    if (!doc.storage_path) {
      toast.error("Document path not available");
      return;
    }
    const url = await getSignedUrl(doc.storage_path);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open document");
  }

  function openRenameDialog(doc: InboxDocument) {
    setRenameDocId(doc.id);
    setRenameDraft(doc.filename);
  }

  async function handleConfirmRename() {
    if (!id || !renameDocId) return;
    const next = renameDraft.trim();
    if (!next) {
      toast.error("Enter a file name");
      return;
    }
    setRenameSaving(true);
    try {
      const ok = await renameTransactionDocumentDisplayName(id, renameDocId, next);
      if (!ok) {
        toast.error("Could not rename document");
        return;
      }
      setInboxDocuments((prev) => prev.map((d) => (d.id === renameDocId ? { ...d, filename: next } : d)));
      toast.success("Document renamed");
      setRenameDocId(null);
    } finally {
      setRenameSaving(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!id) {
    return <Navigate to="/transactions" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] bg-slate-50 p-6">
        <div className="mx-auto max-w-xl text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-[50vh] bg-slate-50 p-6">
        <p className="text-sm text-slate-600">Transaction not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/transactions">Back to transactions</Link>
        </Button>
      </div>
    );
  }

  const titleLabel = transaction.identifier?.trim() || transaction.clientname?.trim() || "Transaction";

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-10 md:p-6">
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-8 gap-1 px-2 text-slate-600" asChild>
            <Link to={`/transactions/${id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to transaction
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Split &amp; assign</h1>
          <p className="mt-1 text-sm text-slate-600">
            {titleLabel} — pick a document, assign it to a checklist item, or save a label without attaching.
            One search field: checklist assignment only.
          </p>
        </div>

        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader className="space-y-1 border-b border-slate-100 pb-4">
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              Filter the list, then select a row. Use the checklist picker to attach, or the labeled-document
              option when nothing matches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                onChange={handleUploadFile}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!id || isUploading || isReadOnly}
                onClick={() => fileInputRef.current?.click()}
                className="border-slate-200"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? "Uploading…" : "Upload"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div className="flex flex-wrap gap-1.5">
                {(["all", "unattached", "recent"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInboxFilter(key)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      inboxFilter === key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    )}
                  >
                    {key === "all" ? "All" : key === "unattached" ? "Unattached" : "Recent"}
                  </button>
                ))}
              </div>
            </div>

            {!checklistTemplateId ? (
              <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                This transaction has no checklist template. Choose a checklist on the transaction page first,
                then return here to assign documents.
              </p>
            ) : (
              <div>
                <Label htmlFor="split-assign-checklist" className="mb-2 block text-sm font-medium text-slate-700">
                  Attach to checklist item
                </Label>
                <ChecklistItemSearchPicker
                  id="split-assign-checklist"
                  items={checklistItems}
                  selectedItem={attachTargetItem}
                  onSelect={(item) => setAttachTargetItem(item)}
                  disabled={isReadOnly}
                  placeholder="Select a checklist item…"
                  onSaveAsLabeledDocument={handleSaveInboxDocAsLabeled}
                  saveAsLabeledAllowed={
                    !!id &&
                    !isReadOnly &&
                    !!selectedInboxDocForAttach &&
                    !selectedInboxDocForAttach.isAttached
                  }
                />
              </div>
            )}

            <div>
              <Label className="mb-2 block text-sm font-medium text-slate-700">
                Document list ({filteredInboxDocuments.length})
              </Label>
              <div className="max-h-[min(420px,55vh)] space-y-2 overflow-y-auto pr-0.5">
                {filteredInboxDocuments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-slate-500">
                    <Inbox className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    <p className="text-sm">No documents match this filter</p>
                  </div>
                ) : (
                  filteredInboxDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border p-3 transition-colors",
                        selectedDocumentForAttach === doc.id
                          ? "border-blue-500 bg-blue-50/80"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDocumentForAttach(doc.id)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      >
                        <FileText
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            selectedDocumentForAttach === doc.id ? "text-blue-600" : "text-slate-500"
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "text-sm font-medium leading-snug",
                              selectedDocumentForAttach === doc.id ? "text-blue-950" : "text-slate-900"
                            )}
                          >
                            {doc.filename}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {formatRelativeTime(doc.receivedAt)}
                          </div>
                          {doc.isAttached && (
                            <Badge
                              variant="outline"
                              className="mt-2 border-slate-200 bg-slate-50 text-[10px] font-normal text-slate-600"
                            >
                              On checklist
                            </Badge>
                          )}
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        {!isReadOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600"
                            title="Rename"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenameDialog(doc);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Rename</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600"
                          title="Split document"
                          asChild
                        >
                          <Link
                            to={`/transactions/${id}/documents/${doc.id}/split`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Scissors className="h-4 w-4" aria-hidden />
                            <span className="sr-only">Split document</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600"
                          title="View"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleViewDocument(doc);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Button
                type="button"
                onClick={() => void handleAttachDocument()}
                disabled={isReadOnly || !checklistTemplateId}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                <Paperclip className="mr-2 h-4 w-4" />
                Attach document
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to={`/transactions/${id}`}>Done</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={renameDocId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDocId(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              This updates the display name only. The stored file and checklist links stay the same.
            </DialogDescription>
          </DialogHeader>
          <div className="py-1">
            <Label htmlFor="split-rename-doc-input" className="text-sm text-slate-700">
              File name
            </Label>
            <Input
              id="split-rename-doc-input"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="mt-1.5"
              maxLength={255}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleConfirmRename();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRenameDocId(null);
                setRenameDraft("");
              }}
              disabled={renameSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleConfirmRename()} disabled={renameSaving}>
              {renameSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
