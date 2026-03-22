import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  FileText,
  Inbox,
  Paperclip,
  Search,
  X,
  Filter,
  Upload,
  Eye,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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
import { uploadDocument, getSignedUrl, attachDocumentToChecklistItem } from "../../../services/transactionDocuments";

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

    // [DEBUG] Attach flow
    console.log("[handleAttachDocument] document id:", inboxDoc.id, "selected checklist item id:", attachTargetItem.id);

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

    const isReferenceOnly = attachTargetItem.isComplianceDocument === false;
    if (!isReplacement) {
      newReviewStatus = isReferenceOnly ? "complete" : "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      newReviewStatus = isReferenceOnly ? "complete" : "pending";
      statusAutoReset = !isReferenceOnly;
    }

    onChecklistItemsChange(
      checklistItems.map((i) =>
        i.id === attachTargetItem.id
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
      if (statusAutoReset) {
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
    // [DEBUG] Temporary logging to trace 400 error
    console.log("[handleUploadFile] transactionId:", transactionId);
    console.log("[handleUploadFile] file:", file?.name ?? "(no file)");
    if (!file || !transactionId) return;

    setIsUploading(true);
    try {
      const doc = await uploadDocument(transactionId, file);
      if (doc) {
        onInboxDocumentsChange([doc, ...inboxDocuments]);
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
      <Card className="gap-2 border-slate-200 shadow-sm">
        <CardHeader className="space-y-0 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="flex items-center gap-1.5 text-base font-semibold">
                <Inbox className="h-4 w-4 shrink-0 text-slate-600" />
                Document Inbox
              </CardTitle>
              <Badge
                variant="outline"
                className="shrink-0 border-blue-200 bg-blue-50/90 text-xs font-normal text-blue-700"
              >
                Unattached: {unattachedCount}
              </Badge>
            </div>
            <div className="flex gap-2">
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
                disabled={!transactionId || isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading…" : "Upload"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenAttachDrawer()}
              >
                <Inbox className="h-4 w-4 mr-2" />
                View Inbox
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenAttachDrawer()}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Attach from Inbox
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {previewInboxDocs.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              <Inbox className="mx-auto mb-2 h-10 w-10 text-slate-300" />
              <p>No unattached documents in inbox</p>
            </div>
          ) : (
            <div className="space-y-2">
              {previewInboxDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 p-2.5 transition-colors hover:border-slate-300"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-900">
                        {doc.filename}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatRelativeTime(doc.receivedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-white text-xs font-normal text-slate-600"
                    >
                      Unattached
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDocument(doc)}
                    >
                      <Eye className="h-3 w-3 mr-1.5" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAttachDrawer()}
                    >
                      <Paperclip className="h-3 w-3 mr-1.5" />
                      Attach
                    </Button>
                  </div>
                </div>
              ))}
              {unattachedCount > 3 && (
                <button
                  onClick={() => handleOpenAttachDrawer()}
                  className="text-sm font-normal text-blue-600 hover:text-blue-700"
                >
                  View all inbox documents ({unattachedCount})
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attach Document Drawer */}
      <Sheet
        open={isAttachDrawerOpen}
        onOpenChange={(open) => {
          setAttachDrawerOpen(open);
          if (!open) setAttachTargetItem(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Attach a Document</SheetTitle>
            <SheetDescription>
              {attachTargetItem
                ? `Select a document to attach to "${attachTargetItem.name}"`
                : "Select a document from inbox"}
            </SheetDescription>
            {attachTargetItem?.isComplianceDocument === false && (
              <p className="text-xs text-slate-600 mt-2">
                Reference documents are not reviewed for compliance
              </p>
            )}
          </SheetHeader>

          <div className="space-y-4 py-4">
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
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <div className="flex gap-2">
                <button
                  onClick={() => setInboxFilter("all")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setInboxFilter("unattached")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "unattached"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  Unattached
                </button>
                <button
                  onClick={() => setInboxFilter("recent")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "recent"
                      ? "bg-purple-600 text-white"
                      : "bg-purple-100 text-purple-700 hover:bg-purple-200"
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
              <Label className="mb-2 block text-sm font-medium text-slate-600">
                Inbox Documents ({filteredInboxDocuments.length})
              </Label>
              <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
                {filteredInboxDocuments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Inbox className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm">No documents found</p>
                  </div>
                ) : (
                  filteredInboxDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`w-full p-3 rounded-lg border-2 transition-all flex items-start gap-3 ${
                        selectedDocumentForAttach === doc.id
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedDocumentForAttach(doc.id)}
                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      >
                        <FileText
                          className={`h-4 w-4 flex-shrink-0 ${
                            selectedDocumentForAttach === doc.id
                              ? "text-blue-600"
                              : "text-slate-600"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm ${
                              selectedDocumentForAttach === doc.id
                                ? "text-blue-900"
                                : "text-slate-900"
                            }`}
                          >
                            {doc.filename}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {formatRelativeTime(doc.receivedAt)}
                          </div>
                          {doc.isAttached && (
                            <Badge className="mt-2 bg-slate-100 text-slate-600 border-slate-200 text-xs">
                              Already Attached
                            </Badge>
                          )}
                        </div>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDocument(doc);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1.5" />
                        View
                      </Button>
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
    </>
  );
}
