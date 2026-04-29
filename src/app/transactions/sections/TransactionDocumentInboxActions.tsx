import React, { useRef, useState } from "react";
import { Inbox, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { uploadDocument } from "../../../services/transactionDocuments";
import type { InboxDocument } from "./TransactionInbox";

export type TransactionDocumentInboxActionsProps = {
  transactionId?: string;
  inboxDocuments: InboxDocument[];
  onInboxDocumentsChange: (docs: InboxDocument[]) => void;
  /** Activity logger; mirrors `TransactionInbox` upload behavior. */
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
  /** Disables Upload (and matches the rest of the page when archived). Open inbox stays usable. */
  isReadOnly?: boolean;
  /** Called when the user clicks "Open inbox" — page wires this to the existing Attach Sheet. */
  onOpenInbox: () => void;
};

/**
 * Compact "Document Inbox" row used inside the Transaction card header. Replaces the standalone
 * Document Inbox card. Renders:
 *
 *     Document Inbox · {n} unattached · [Upload] [Open inbox]
 *
 * Upload reuses the same `uploadDocument` service + activity-log call as the previous card so
 * behavior is identical; "Open inbox" delegates to a parent-supplied handler that opens the
 * existing Attach Sheet (which still lives in `TransactionInbox`).
 */
export function TransactionDocumentInboxActions({
  transactionId,
  inboxDocuments,
  onInboxDocumentsChange,
  addActivityEntry,
  currentUserRole = "Admin",
  isReadOnly = false,
  onOpenInbox,
}: TransactionDocumentInboxActionsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unattachedCount = inboxDocuments.filter((d) => !d.isAttached).length;

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
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
      } else {
        toast.error("Upload failed");
      }
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5 text-slate-700">
        <Inbox className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="font-medium leading-none">Document Inbox</span>
      </span>
      <span className="text-slate-300" aria-hidden>
        ·
      </span>
      <Badge
        variant="outline"
        className="shrink-0 border-slate-200 bg-slate-50 text-xs font-normal text-slate-600"
      >
        {unattachedCount} unattached
      </Badge>
      <span className="text-slate-300" aria-hidden>
        ·
      </span>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
        onChange={(e) => void handleUploadFile(e)}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 border-slate-200 px-2.5 text-xs"
        disabled={!transactionId || isUploading || isReadOnly}
        onClick={() => fileInputRef.current?.click()}
        title={isReadOnly ? "Archived transaction — uploads disabled" : "Upload a document"}
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {isUploading ? "Uploading…" : "Upload"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 border-slate-200 px-2.5 text-xs"
        onClick={onOpenInbox}
        title="Browse and attach inbox documents"
      >
        <Inbox className="h-3.5 w-3.5" aria-hidden />
        Open inbox
      </Button>
    </div>
  );
}

export default TransactionDocumentInboxActions;
