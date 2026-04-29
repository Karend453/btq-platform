import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ExternalLink,
  FileText,
  Inbox,
  Paperclip,
  Eye,
  Pencil,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ChecklistItemSearchPicker } from "./ChecklistItemSearchPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  getSignedUrl,
  attachDocumentToChecklistItem,
  renameTransactionDocumentDisplayName,
  hardDeleteUnattachedInboxDocument,
  uploadDocument,
} from "../../../services/transactionDocuments";
import {
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";
import { TransactionFormsLinkEditDialog } from "./TransactionFormsLinkEditDialog";
import { TransactionSendDocumentsDialog } from "./TransactionSendDocumentsDialog";

/** "Open [Provider]" copy used by the Attach Drawer's primary action button. */
const PROVIDER_LAUNCH_LABELS: Record<FormsProviderValue, string> = {
  dotloop: "Open Dotloop",
  skyslope: "Open SkySlope",
  zipforms: "Open ZipForms",
  other: "Open Forms Workspace",
  none: "Open Forms Workspace",
};

export interface InboxDocument {
  id: string;
  filename: string;
  storage_path: string;
  receivedAt: Date;
  isAttached: boolean;
  attachedToItemId?: string;
}

export interface ChecklistItem {
  id: string;
  name: string;
  status: "complete" | "pending" | "rejected";
  updatedAt: string;
  requirement: "required" | "optional";
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  notes: unknown[];
  comments: unknown[];
  version: number;
  /** Section/group title for visual grouping (from template). */
  sectionTitle?: string;
  /** Template section id for placement (custom items use this; template rows backfilled). */
  section_id?: string | null;
  sort_order?: number;
  /** Null when transaction-only custom item. */
  template_item_id?: string | null;
  attachedDocument?: {
    id: string;
    filename: string;
    storage_path: string;
    version: number;
    updatedAt: Date;
    previousVersion?: number;
  };
  suggestedDocument?: {
    id: string;
    filename: string;
    confidence: "high" | "low";
  };
  /** `checklist_items.document_id` — stable link to `transaction_documents.id`. */
  documentId?: string | null;
  reviewNote?: string | null;
  /** false = reference/supplemental; not reviewed for compliance. */
  isComplianceDocument?: boolean;
  /** ISO timestamp when archived; omitted/null = active in the main checklist. */
  archivedAt?: string | null;
  archiveGroupId?: string | null;
  archiveGroupLabel?: string | null;
  archiveGroupNote?: string | null;
  archiveGroupCreatedAt?: string | null;
}

type InboxFilter = "all" | "unattached" | "recent";

export type TransactionInboxProps = {
  transactionId?: string;
  inboxDocuments: InboxDocument[];
  onInboxDocumentsChange: (docs: InboxDocument[]) => void;
  checklistItems: ChecklistItem[];
  onChecklistItemsChange: (items: ChecklistItem[]) => void;
  onViewInbox?: () => void;
  addActivityEntry?: (entry: {
    actor: "System" | "Agent" | "Admin" | "Broker";
    category: "docs" | "forms" | "system";
    type: string;
    message: string;
    meta?: Record<string, unknown>;
    documentId?: string | null;
    checklistItemId?: string | null;
  }) => void;
  currentUserRole?: "Admin" | "Agent" | "Broker";
  /** When true, uploads and renames are disabled (e.g. archived transaction). */
  isReadOnly?: boolean;
  /** When provided, attach drawer can be opened from outside (e.g. Checklist) */
  attachDrawerOpen?: boolean;
  attachTargetItem?: ChecklistItem | null;
  onAttachDrawerOpenChange?: (open: boolean) => void;
  onAttachTargetChange?: (item: ChecklistItem | null) => void;
  /** Reserved for future intake UX; optional. */
  intakeEmail?: string | null;
  onCopyIntakeEmail?: (text?: string | null) => void;
  /** Current value of `transactions.external_forms_url`. Drives the "Open [Provider]" action. */
  externalFormsUrl?: string | null;
  /** Current user's preferred forms provider; powers the action button label. */
  preferredFormsProvider?: FormsProviderValue | null;
  /** Fires after the embedded edit dialog saves/clears the link so the page can refresh state. */
  onSavedExternalFormsUrl?: (nextUrl: string | null) => void;
};

function formatRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) {
    return "Just now";
  }
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

export default function TransactionInbox({
  transactionId,
  inboxDocuments,
  onInboxDocumentsChange,
  checklistItems,
  onChecklistItemsChange,
  addActivityEntry,
  currentUserRole = "Admin",
  isReadOnly = false,
  attachDrawerOpen: controlledAttachDrawerOpen,
  attachTargetItem: controlledAttachTargetItem,
  onAttachDrawerOpenChange,
  onAttachTargetChange,
  intakeEmail,
  onCopyIntakeEmail: _onCopyIntakeEmail,
  externalFormsUrl,
  preferredFormsProvider,
  onSavedExternalFormsUrl,
}: TransactionInboxProps) {
  const [internalAttachDrawerOpen, setInternalAttachDrawerOpen] = useState(false);
  const [internalAttachTargetItem, setInternalAttachTargetItem] = useState<ChecklistItem | null>(null);
  const [selectedDocumentForAttach, setSelectedDocumentForAttach] = useState<string | null>(null);
  // Default to "unattached" — the Attach Drawer's main job is to attach NEW docs, so showing
  // already-attached docs first is noisy. Users can switch via the subtle filter dropdown.
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("unattached");
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<InboxDocument | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  // Drawer-local upload state (separate from the Document Inbox header upload state in the
  // Transaction card). Both share the same `uploadDocument` service so behavior is identical.
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // "Send documents" modal — same UX as the Documents-header chip. Shown when the user clicks
  // "Open [Provider]" and an `external_forms_url` is already saved.
  const [sendDocsOpen, setSendDocsOpen] = useState(false);
  // Add/Update transaction-link dialog — opened either from "Open [Provider]" when no link is
  // saved yet, or from inside the Send Documents modal via "Update link"/"Add [Provider] link".
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const trimmedExternalFormsUrl = (externalFormsUrl ?? "").trim();
  const hasExternalFormsUrl = trimmedExternalFormsUrl !== "";
  const providerLaunchLabel =
    preferredFormsProvider && isFormsProviderValue(preferredFormsProvider)
      ? PROVIDER_LAUNCH_LABELS[preferredFormsProvider]
      : "Open Forms Workspace";

  const isControlled = controlledAttachDrawerOpen !== undefined && onAttachDrawerOpenChange !== undefined;
  const isAttachDrawerOpen = isControlled ? controlledAttachDrawerOpen : internalAttachDrawerOpen;
  const attachTargetItem = isControlled ? (controlledAttachTargetItem ?? null) : internalAttachTargetItem;

  const setAttachDrawerOpen = (open: boolean) => {
    if (isControlled) {
      onAttachDrawerOpenChange?.(open);
    } else {
      setInternalAttachDrawerOpen(open);
    }
  };

  const setAttachTargetItem = (item: ChecklistItem | null) => {
    if (isControlled) {
      onAttachTargetChange?.(item);
    } else {
      setInternalAttachTargetItem(item);
    }
  };

  useEffect(() => {
    if (isControlled && controlledAttachDrawerOpen && controlledAttachTargetItem) {
      setSelectedDocumentForAttach(null);
      setInboxFilter("unattached");
    }
  }, [isControlled, controlledAttachDrawerOpen, controlledAttachTargetItem]);

  const handleOpenAttachDrawer = (fromItem?: ChecklistItem) => {
    setAttachTargetItem(fromItem || null);
    setSelectedDocumentForAttach(null);
    setInboxFilter("unattached");
    setAttachDrawerOpen(true);
  };

  async function handleDrawerUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !transactionId) return;

    setIsUploading(true);
    try {
      const doc = await uploadDocument(transactionId, file);
      if (doc) {
        onInboxDocumentsChange([doc, ...inboxDocuments]);
        addActivityEntry?.({
          actor: currentUserRole,
          category: "docs",
          type: "document_uploaded",
          message: `Document uploaded: ${doc.filename}`,
          documentId: doc.id,
        });
        toast.success(`Uploaded "${file.name}"`);
        // Pre-select the freshly uploaded doc so the user can attach it immediately.
        setSelectedDocumentForAttach(doc.id);
      } else {
        toast.error("Upload failed");
      }
    } finally {
      setIsUploading(false);
    }
  }

  function handleOpenProvider() {
    // Mirror the Documents-header chip exactly: when a link is saved, surface the Send
    // Documents modal (intake email + copy + Launch [Provider] + Update link). Never open
    // the external URL straight from the chip — the modal is the only bridge.
    if (hasExternalFormsUrl) {
      setSendDocsOpen(true);
      return;
    }
    // No saved link → open the Add/Update transaction-link dialog.
    setLinkDialogOpen(true);
  }

  const handleAttachDocument = async () => {
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

    // Persist to DB first
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

    onChecklistItemsChange(
      checklistItems.map((i) =>
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

    onInboxDocumentsChange(
      inboxDocuments.map((doc) => {
        if (doc.id === inboxDoc.id) {
          return { ...doc, isAttached: true, attachedToItemId: attachTargetItem.id };
        }
        if (isReplacement && attachTargetItem.attachedDocument?.id === doc.id) {
          return { ...doc, isAttached: false, attachedToItemId: undefined };
        }
        return doc;
      })
    );

    if (addActivityEntry) {
      if (isReplacement) {
        addActivityEntry({
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
        addActivityEntry({
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
        addActivityEntry({
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
    }

    toast.success(
      isReplacement
        ? `Replaced document on "${attachTargetItem.name}" (v${newVersion})`
        : `Attached "${inboxDoc.filename}" to "${attachTargetItem.name}" (v${newVersion})`
    );
    setAttachDrawerOpen(false);
    setAttachTargetItem(null);
    setSelectedDocumentForAttach(null);
  };

  const handleViewDocument = async (doc: InboxDocument) => {
    if (!doc.storage_path) {
      toast.error("Document path not available");
      return;
    }
    const url = await getSignedUrl(doc.storage_path);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open document");
  };

  const openRenameDialog = (doc: InboxDocument) => {
    setRenameDocId(doc.id);
    setRenameDraft(doc.filename);
  };

  function openDeleteConfirm(doc: InboxDocument) {
    if (doc.isAttached) {
      toast.error("Detach this document from the checklist before deleting it from the inbox.");
      return;
    }
    setDeleteConfirmDoc(doc);
  }

  async function handleConfirmDeleteInboxDocument() {
    if (!transactionId || !deleteConfirmDoc) return;
    if (deleteConfirmDoc.isAttached) {
      toast.error("This document is attached to the checklist and cannot be deleted here.");
      setDeleteConfirmDoc(null);
      return;
    }
    setDeleteSaving(true);
    try {
      const result = await hardDeleteUnattachedInboxDocument(transactionId, deleteConfirmDoc.id);
      if (!result.ok) {
        toast.error(result.error || "Could not delete document");
        return;
      }
      const removedId = deleteConfirmDoc.id;
      onInboxDocumentsChange(inboxDocuments.filter((d) => d.id !== removedId));
      if (selectedDocumentForAttach === removedId) {
        setSelectedDocumentForAttach(null);
      }
      if (addActivityEntry) {
        addActivityEntry({
          actor: currentUserRole,
          category: "docs",
          type: "DOC_DELETED_FROM_INBOX",
          message: `${currentUserRole} permanently removed an inbox-only copy: "${deleteConfirmDoc.filename}"`,
          meta: { fileName: deleteConfirmDoc.filename },
          documentId: removedId,
        });
      }
      toast.success("Document permanently removed");
      setDeleteConfirmDoc(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  const handleConfirmRename = async () => {
    if (!transactionId || !renameDocId) return;
    const next = renameDraft.trim();
    if (!next) {
      toast.error("Enter a file name");
      return;
    }
    setRenameSaving(true);
    try {
      const ok = await renameTransactionDocumentDisplayName(transactionId, renameDocId, next);
      if (!ok) {
        toast.error("Could not rename document");
        return;
      }
      onInboxDocumentsChange(
        inboxDocuments.map((d) => (d.id === renameDocId ? { ...d, filename: next } : d))
      );
      toast.success("Document renamed");
      setRenameDocId(null);
    } finally {
      setRenameSaving(false);
    }
  };

  /** Display name only; keeps document in inbox unattached to any checklist row. */
  async function handleSaveInboxDocAsLabeled(label: string) {
    const trimmed = label.trim();
    if (!transactionId || !selectedDocumentForAttach || !trimmed) {
      toast.error("Select an unattached document and enter a label");
      return;
    }
    const doc = inboxDocuments.find((d) => d.id === selectedDocumentForAttach);
    if (!doc || doc.isAttached) {
      toast.error("Choose an unattached inbox document to label");
      return;
    }
    const ok = await renameTransactionDocumentDisplayName(transactionId, selectedDocumentForAttach, trimmed);
    if (!ok) {
      toast.error("Could not save label");
      return;
    }
    onInboxDocumentsChange(
      inboxDocuments.map((d) => (d.id === selectedDocumentForAttach ? { ...d, filename: trimmed } : d))
    );
    if (addActivityEntry) {
      addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "document_labeled",
        message: `${currentUserRole} saved an inbox document as “${trimmed}” (not linked to checklist)`,
        meta: { displayName: trimmed },
        documentId: selectedDocumentForAttach,
      });
    }
    toast.success(`Labeled as “${trimmed}” — still in inbox`);
  }

  const getFilteredInboxDocuments = () => {
    let filtered = inboxDocuments;

    if (inboxFilter === "unattached") {
      filtered = filtered.filter((doc) => !doc.isAttached);
    } else if (inboxFilter === "recent") {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((doc) => doc.receivedAt >= twoDaysAgo);
    }

    return filtered;
  };

  const filteredInboxDocuments = getFilteredInboxDocuments();

  const selectedInboxDocForAttach = selectedDocumentForAttach
    ? inboxDocuments.find((d) => d.id === selectedDocumentForAttach) ?? null
    : null;

  return (
    <>
      {/* Standalone Document Inbox card removed — its actions now live in the Transaction card
          header (`TransactionDocumentInboxActions`). The Sheet/Dialogs below remain so attach,
          rename, and delete flows continue to work whenever they're triggered. */}

      {/* Attach Document Drawer */}
      <Sheet
        open={isAttachDrawerOpen}
        onOpenChange={(open) => {
          setAttachDrawerOpen(open);
          if (!open) setAttachTargetItem(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="space-y-1 border-b border-slate-100 pb-4">
            <SheetTitle>Attach a Document</SheetTitle>
            <SheetDescription>
              {attachTargetItem
                ? `Select a document to attach to "${attachTargetItem.name}"`
                : "Select a document from the inbox"}
            </SheetDescription>
            {attachTargetItem?.isComplianceDocument === false && (
              <p className="mt-2 text-xs text-slate-600">
                Reference documents are not reviewed for compliance
              </p>
            )}
          </SheetHeader>

          <div className="space-y-5 py-5">
            {/*
              Action bar replaces the previous All/Unattached/Recent filter chips. Two intent-based
              primary actions; the filter survives only as a subtle dropdown on the far right.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                onChange={(e) => void handleDrawerUploadFile(e)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 border-slate-200"
                disabled={!transactionId || isUploading || isReadOnly}
                onClick={() => fileInputRef.current?.click()}
                title={
                  isReadOnly ? "Archived transaction — uploads disabled" : "Upload a file from your computer"
                }
              >
                <Upload className="h-4 w-4" aria-hidden />
                {isUploading ? "Uploading…" : "Upload from computer"}
              </Button>
              {preferredFormsProvider == null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-slate-200"
                  asChild
                  title="Choose your forms provider in Settings"
                >
                  <Link to="/settings?tab=forms-provider">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Set forms provider
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-slate-200"
                  onClick={handleOpenProvider}
                  title={
                    hasExternalFormsUrl
                      ? "Open forms + copy transaction email"
                      : "No transaction link saved yet — opens the Add link dialog"
                  }
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {providerLaunchLabel}
                </Button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Label htmlFor="inbox-filter" className="text-xs font-normal text-slate-500">
                  Show
                </Label>
                <Select
                  value={inboxFilter}
                  onValueChange={(v) => setInboxFilter(v as InboxFilter)}
                >
                  <SelectTrigger
                    id="inbox-filter"
                    className="h-8 w-[8.5rem] gap-1.5 border-slate-200 bg-transparent text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="unattached">Unattached</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="recent">Recent (2d)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Attach To (when launched from inbox) */}
            {!attachTargetItem && (
              <div>
                <Label htmlFor="attachTo" className="text-sm font-medium text-slate-700 mb-2 block">
                  Attach to checklist item
                </Label>
                <ChecklistItemSearchPicker
                  id="attachTo"
                  items={checklistItems}
                  selectedItem={attachTargetItem}
                  onSelect={(item) => setAttachTargetItem(item)}
                  disabled={isReadOnly}
                  placeholder="Select a checklist item…"
                  onSaveAsLabeledDocument={handleSaveInboxDocAsLabeled}
                  saveAsLabeledAllowed={
                    !!transactionId &&
                    !isReadOnly &&
                    !!selectedInboxDocForAttach &&
                    !selectedInboxDocForAttach.isAttached
                  }
                />
              </div>
            )}

            {/* Attach To Preview (when launched from checklist) */}
            {attachTargetItem && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-2.5">
                <div className="mb-0.5 text-xs text-blue-700">
                  Attach to:
                </div>
                <div className="text-sm text-blue-900">
                  {attachTargetItem.name}
                </div>
              </div>
            )}

            {/* Document List */}
            <div>
              <Label className="mb-2 block text-sm font-medium text-slate-700">
                Documents ({filteredInboxDocuments.length})
              </Label>
              <div className="max-h-[min(400px,50vh)] space-y-2 overflow-y-auto pr-0.5">
                {filteredInboxDocuments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-slate-500">
                    <Inbox className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    <p className="text-sm">No documents match this filter</p>
                  </div>
                ) : (
                  filteredInboxDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`flex w-full items-start gap-2 rounded-lg border p-3 transition-colors ${
                        selectedDocumentForAttach === doc.id
                          ? "border-blue-500 bg-blue-50/80"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDocumentForAttach(doc.id)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      >
                        <FileText
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            selectedDocumentForAttach === doc.id ? "text-blue-600" : "text-slate-500"
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-medium leading-snug ${
                              selectedDocumentForAttach === doc.id ? "text-blue-950" : "text-slate-900"
                            }`}
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
                        {transactionId && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-600" asChild>
                            <Link
                              to={`/transactions/${transactionId}/documents/${doc.id}/split`}
                              title="Split document"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Scissors className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Split document</span>
                            </Link>
                          </Button>
                        )}
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
                        {!isReadOnly && !doc.isAttached && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:text-red-700"
                            title="Permanently delete inbox copy"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteConfirm(doc);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete permanently</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAttachDrawerOpen(false);
                setAttachTargetItem(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAttachDocument}>
              <Paperclip className="h-4 w-4 mr-2" />
              Attach Document
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
            <Label htmlFor="rename-doc-input" className="text-sm text-slate-700">
              File name
            </Label>
            <Input
              id="rename-doc-input"
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

      <Dialog
        open={deleteConfirmDoc !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) {
            setDeleteConfirmDoc(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Permanently delete this document?</DialogTitle>
            <DialogDescription className="space-y-3 pt-1 text-slate-600">
              <span className="block">
                This permanently removes the BTQ copy of{" "}
                <span className="font-medium text-slate-900">
                  {deleteConfirmDoc?.filename ?? "this file"}
                </span>{" "}
                from this transaction. The database record and the file in storage will be deleted.
                This cannot be undone in BTQ.
              </span>
              <span className="block text-sm">
                The original may still exist outside BTQ; you can upload again if this was a mistake.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmDoc(null)}
              disabled={deleteSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDeleteInboxDocument()}
              disabled={deleteSaving}
            >
              {deleteSaving ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Send documents to this transaction" modal — same component the Documents-header chip
          uses. Surfaces intake email + copy + Launch [Provider] + Update link. The Launch button
          is the only path to the external URL; we never open it directly from the action bar. */}
      <TransactionSendDocumentsDialog
        open={sendDocsOpen}
        onOpenChange={setSendDocsOpen}
        intakeEmail={intakeEmail ?? null}
        externalFormsUrl={externalFormsUrl ?? null}
        preferredProvider={preferredFormsProvider ?? null}
        disabled={isReadOnly}
        onRequestEditLink={() => {
          // The modal already closes itself before this fires; queue the edit dialog.
          setLinkDialogOpen(true);
        }}
      />

      {/* Add/Update transaction-link dialog — opened either directly from "Open [Provider]" when
          no link is saved, or from inside the Send Documents modal via "Update link". Same
          component the Documents-header chip uses, so save/clear flows are identical. */}
      {transactionId ? (
        <TransactionFormsLinkEditDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          transactionId={transactionId}
          externalFormsUrl={externalFormsUrl ?? null}
          preferredProvider={preferredFormsProvider ?? null}
          disabled={isReadOnly}
          onSaved={(nextUrl) => {
            onSavedExternalFormsUrl?.(nextUrl);
            // After saving a valid link, surface the Send Documents modal so the user can copy
            // the intake email and Launch [Provider] in one motion — without ever opening the
            // external URL straight from the action bar.
            if (nextUrl) setSendDocsOpen(true);
          }}
        />
      ) : null}
    </>
  );
}
