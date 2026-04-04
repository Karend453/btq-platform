import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  FileText,
  Inbox,
  Paperclip,
  Search,
  X,
  Filter,
  Upload,
  Eye,
  Pencil,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { cn } from "../../components/ui/utils";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  uploadDocument,
  getSignedUrl,
  attachDocumentToChecklistItem,
  renameTransactionDocumentDisplayName,
} from "../../../services/transactionDocuments";

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
  intakeEmail: _intakeEmail,
  onCopyIntakeEmail: _onCopyIntakeEmail,
}: TransactionInboxProps) {
  const [internalAttachDrawerOpen, setInternalAttachDrawerOpen] = useState(false);
  const [internalAttachTargetItem, setInternalAttachTargetItem] = useState<ChecklistItem | null>(null);
  const [selectedDocumentForAttach, setSelectedDocumentForAttach] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxSearchQuery, setInboxSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setInboxSearchQuery("");
      setInboxFilter("unattached");
    }
  }, [isControlled, controlledAttachDrawerOpen, controlledAttachTargetItem]);

  const handleOpenAttachDrawer = (fromItem?: ChecklistItem) => {
    setAttachTargetItem(fromItem || null);
    setSelectedDocumentForAttach(null);
    setInboxSearchQuery("");
    setInboxFilter("unattached");
    setAttachDrawerOpen(true);
  };

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

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !transactionId) return;

    setIsUploading(true);
    try {
      const doc = await uploadDocument(transactionId, file);
      if (doc) {
        onInboxDocumentsChange([doc, ...inboxDocuments]);
        if (addActivityEntry) {
          addActivityEntry({
            actor: currentUserRole,
            category: "docs",
            type: "document_uploaded",
            message: `Document uploaded: ${doc.filename}`,
            documentId: doc.id,
          });
        }
        toast.success(`Uploaded "${file.name}"`);
      } else {
        toast.error("Upload failed");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const unattachedDocuments = inboxDocuments.filter((doc) => !doc.isAttached);
  const unattachedCount = unattachedDocuments.length;
  const previewInboxDocs = unattachedDocuments.slice(0, 3);

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

  const getFilteredInboxDocuments = () => {
    let filtered = inboxDocuments;

    if (inboxFilter === "unattached") {
      filtered = filtered.filter((doc) => !doc.isAttached);
    } else if (inboxFilter === "recent") {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((doc) => doc.receivedAt >= twoDaysAgo);
    }

    if (inboxSearchQuery.trim()) {
      filtered = filtered.filter((doc) =>
        doc.filename.toLowerCase().includes(inboxSearchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const filteredInboxDocuments = getFilteredInboxDocuments();

  return (
    <>
      {/* Document Inbox Card */}
      <Collapsible defaultOpen>
        <Card className="gap-0 overflow-hidden border-slate-200/90 bg-white shadow-sm">
          <CardHeader className="space-y-3 border-b border-slate-100 px-4 py-4 sm:space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5 text-base font-semibold leading-none text-slate-900">
                  <Inbox className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  Document Inbox
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-slate-200 bg-slate-50 text-xs font-normal text-slate-600"
                >
                  {unattachedCount} unattached
                </Badge>
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md outline-none",
                      "text-slate-500 transition-colors hover:bg-slate-100/80",
                      "focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-2",
                      "data-[state=open]:[&>svg]:rotate-180"
                    )}
                    aria-label="Toggle Document Inbox section"
                  >
                    <ChevronDown className="h-4 w-4 transition-transform duration-200" aria-hidden />
                  </button>
                </CollapsibleTrigger>
                <div className="flex flex-wrap gap-2">
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
                    disabled={!transactionId || isUploading || isReadOnly}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-slate-200"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {isUploading ? "Uploading…" : "Upload"}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => handleOpenAttachDrawer()}
                  >
                    <Inbox className="mr-2 h-4 w-4" />
                    Open inbox
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent className="overflow-hidden">
            <CardContent className="px-4 pb-5 pt-4">
              {previewInboxDocs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-sm text-slate-500">
                  <Inbox className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                  <p>No unattached documents</p>
                  <p className="mt-1 text-xs text-slate-400">Upload a file or open the inbox to see all documents.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {previewInboxDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">{doc.filename}</div>
                        <div className="text-[11px] text-slate-500">{formatRelativeTime(doc.receivedAt)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!isReadOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600"
                            title="Rename"
                            onClick={() => openRenameDialog(doc)}
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
                          title="View"
                          onClick={() => void handleViewDocument(doc)}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600"
                          title="Attach to checklist"
                          onClick={() => handleOpenAttachDrawer()}
                        >
                          <Paperclip className="h-4 w-4" />
                          <span className="sr-only">Attach</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {unattachedCount > 3 && (
                    <button
                      type="button"
                      onClick={() => handleOpenAttachDrawer()}
                      className="w-full rounded-md py-1.5 text-center text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    >
                      View all {unattachedCount} documents in inbox
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search inbox documents..."
                value={inboxSearchQuery}
                onChange={(e) => setInboxSearchQuery(e.target.value)}
                className="pl-9"
              />
              {inboxSearchQuery && (
                <button
                  onClick={() => setInboxSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setInboxFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    inboxFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setInboxFilter("unattached")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    inboxFilter === "unattached"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Unattached
                </button>
                <button
                  type="button"
                  onClick={() => setInboxFilter("recent")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    inboxFilter === "recent"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Recent
                </button>
              </div>
            </div>

            {/* Attach To (when launched from inbox) */}
            {!attachTargetItem && (
              <div>
                <Label htmlFor="attachTo" className="text-sm font-medium text-slate-700 mb-2 block">
                  Attach to checklist item
                </Label>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const item = checklistItems.find((i) => i.id === value);
                    setAttachTargetItem(item || null);
                  }}
                >
                  <SelectTrigger id="attachTo">
                    <SelectValue placeholder="Select a checklist item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {checklistItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
    </>
  );
}
