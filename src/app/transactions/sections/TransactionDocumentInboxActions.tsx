import React from "react";
import { Inbox } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import type { InboxDocument } from "./TransactionInbox";

export type TransactionDocumentInboxActionsProps = {
  inboxDocuments: InboxDocument[];
  /** Called when the user clicks "Open inbox" — page wires this to the existing Attach Sheet. */
  onOpenInbox: () => void;
};

/**
 * Compact "Document Inbox" row used inside the Transaction card header. Renders:
 *
 *     Document Inbox · {n} unattached · [Open inbox]
 *
 * Intentionally status/summary only — uploads live inside the inbox itself (Attach Sheet in
 * `TransactionInbox`) so the user has one obvious place to add and manage documents. Putting
 * Upload in this header was confusing because the resulting file landed in the inbox but the
 * user still had to click "Open inbox" to see/manage it.
 */
export function TransactionDocumentInboxActions({
  inboxDocuments,
  onOpenInbox,
}: TransactionDocumentInboxActionsProps) {
  const unattachedCount = inboxDocuments.filter((d) => !d.isAttached).length;

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
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 border-slate-200 px-2.5 text-xs"
        onClick={onOpenInbox}
        title="Browse, upload, and attach inbox documents"
      >
        <Inbox className="h-3.5 w-3.5" aria-hidden />
        Open inbox
      </Button>
    </div>
  );
}

export default TransactionDocumentInboxActions;
