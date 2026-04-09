import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ArrowLeft, ExternalLink, FileText, Layers, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { cn } from "../components/ui/utils";
import { getTransaction, type TransactionRow } from "../../services/transactions";
import {
  attachDocumentToChecklistItem,
  fetchDocumentsByTransactionId,
  getSignedUrl,
  insertSplitOutputDocument,
} from "../../services/transactionDocuments";
import {
  ensureChecklistItemsForTransaction,
  fetchChecklistItemsForTransaction,
} from "../../services/checklistItems";
import { fetchCommentsByTransactionId } from "../../services/checklistItemComments";
import {
  getTransactionRuntimeRole,
  transactionRuntimeRoleToUiRole,
  type UiTransactionRole,
} from "../../services/auth";
import { ChecklistItemSearchPicker } from "./sections/ChecklistItemSearchPicker";
import type { ChecklistItem, InboxDocument } from "./sections/TransactionInbox";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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

type SplitOutputGroup = {
  id: string;
  name: string;
  pageIndices: number[];
  checklistItem: ChecklistItem | null;
  /** When true, checklist-driven name updates are skipped. */
  outputNameUserEdited: boolean;
};

function newGroupId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultGroupName(pages: number[]) {
  if (pages.length === 0) return "New output";
  const sorted = [...pages].sort((a, b) => a - b);
  const a = sorted[0]!;
  const b = sorted[sorted.length - 1]!;
  if (a === b) return `Page ${a}`;
  return `Pages ${a}–${b}`;
}

/** Display name for a split: checklist label when attached, otherwise page-range label. */
function suggestedSplitOutputName(pages: number[], checklistItem: ChecklistItem | null): string {
  if (checklistItem) {
    const n = checklistItem.name.trim();
    if (n) return n;
  }
  return defaultGroupName(pages);
}

function isImageFilename(name: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

/**
 * Use pdf.js for any non-image document once we have a URL. Many PDFs are stored without a `.pdf`
 * display name; probing is the reliable way to get `numPages`.
 */
function shouldLoadPdfPageCount(doc: InboxDocument | null, signedPreviewUrl: string | null): boolean {
  return Boolean(doc && signedPreviewUrl && !isImageFilename(doc.filename));
}

function assignedPagesFromGroups(groups: SplitOutputGroup[]): Set<number> {
  const s = new Set<number>();
  for (const g of groups) {
    for (const p of g.pageIndices) s.add(p);
  }
  return s;
}

/** Compact human-readable list of 1-based page numbers (e.g. "1, 4, 5–7"). */
function summarizePageNumbers(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n !== undefined && n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(runStart === prev ? String(runStart) : `${runStart}–${prev}`);
    if (n !== undefined) {
      runStart = n;
      prev = n;
    }
  }
  return parts.join(", ");
}

export default function DocumentSplitWorkspacePage() {
  const navigate = useNavigate();
  const { id: transactionId, documentId } = useParams<{ id: string; documentId: string }>();
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [sourceDoc, setSourceDoc] = useState<InboxDocument | null>(null);
  const [allDocsForMerge, setAllDocsForMerge] = useState<InboxDocument[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UiTransactionRole>("Admin");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfNumPagesLoading, setPdfNumPagesLoading] = useState(false);
  const [pdfNumPagesError, setPdfNumPagesError] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitOutputGroup[]>([]);
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false);
  const [savingSplits, setSavingSplits] = useState(false);

  const checklistTemplateId = transaction?.checklist_template_id?.trim() || null;
  const isReadOnly = (transaction?.status ?? "").trim().toLowerCase() === "archived";

  const pageSlots = useMemo(() => {
    if (!sourceDoc) return [] as number[];
    if (isImageFilename(sourceDoc.filename)) {
      return Array.from({ length: 1 }, (_, i) => i + 1);
    }
    if (!previewUrl) return [];
    if (pdfNumPages != null && pdfNumPages >= 1) {
      return Array.from({ length: pdfNumPages }, (_, i) => i + 1);
    }
    if (pdfNumPagesLoading) return [];
    if (pdfNumPagesError) return [1];
    return [];
  }, [sourceDoc, previewUrl, pdfNumPages, pdfNumPagesLoading, pdfNumPagesError]);

  useEffect(() => {
    let cancelled = false;
    getTransactionRuntimeRole().then((r) => {
      if (!cancelled) setCurrentUserRole(transactionRuntimeRoleToUiRole(r));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!transactionId || !documentId) return;
    setLoading(true);
    try {
      const tx = await getTransaction(transactionId);
      setTransaction(tx);
      const docs = await fetchDocumentsByTransactionId(transactionId);
      setAllDocsForMerge(docs);
      const found = docs.find((d) => d.id === documentId) ?? null;
      setSourceDoc(found);

      const templateId = tx?.checklist_template_id?.trim() || null;
      if (!tx || !templateId) {
        setChecklistItems([]);
        return;
      }
      await ensureChecklistItemsForTransaction(transactionId, templateId);
      const [items, commentsByItem] = await Promise.all([
        fetchChecklistItemsForTransaction(transactionId, templateId),
        fetchCommentsByTransactionId(transactionId),
      ]);
      const withComments: ChecklistItem[] = items.map((item) => ({
        ...item,
        comments: commentsByItem.get(String(item.id)) ?? [],
      })) as ChecklistItem[];
      setChecklistItems(mergeInboxIntoChecklistItems(withComments, docs));
    } finally {
      setLoading(false);
    }
  }, [transactionId, documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setChecklistItems((prev) => mergeInboxIntoChecklistItems(prev, allDocsForMerge));
  }, [allDocsForMerge]);

  useEffect(() => {
    if (!sourceDoc?.storage_path) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void getSignedUrl(sourceDoc.storage_path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceDoc?.storage_path]);

  useEffect(() => {
    if (!shouldLoadPdfPageCount(sourceDoc, previewUrl)) {
      setPdfNumPages(null);
      setPdfNumPagesLoading(false);
      setPdfNumPagesError(null);
      return;
    }

    let cancelled = false;
    setPdfNumPages(null);
    setPdfNumPagesError(null);
    setPdfNumPagesLoading(true);

    void (async () => {
      try {
        const loadingTask = getDocument({ url: previewUrl! });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        const n = pdf.numPages;
        console.log(`[DocumentSplitWorkspace] PDF page count: ${n}`);
        setPdfNumPages(n);
        setPdfNumPagesLoading(false);
        await pdf.destroy();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[DocumentSplitWorkspace] Could not read PDF page count", e);
        setPdfNumPagesError(msg);
        setPdfNumPagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl, sourceDoc?.id, sourceDoc?.filename, sourceDoc?.storage_path]);

  const assignedPageSet = useMemo(() => assignedPagesFromGroups(splitGroups), [splitGroups]);

  const unassignedPages = useMemo(() => {
    if (pageSlots.length === 0) return [];
    return pageSlots.filter((p) => !assignedPageSet.has(p));
  }, [pageSlots, assignedPageSet]);

  const goToTransaction = useCallback(() => {
    navigate(`/transactions/${transactionId}`);
  }, [navigate, transactionId]);

  const persistSplitOutputsAndExit = useCallback(async () => {
    if (!transactionId || !sourceDoc) return;
    if (splitGroups.length === 0) {
      goToTransaction();
      return;
    }
    setSavingSplits(true);
    try {
      for (const g of splitGroups) {
        if (g.pageIndices.length === 0) continue;
        const created = await insertSplitOutputDocument({
          transactionId,
          sourceDocumentId: sourceDoc.id,
          sourceStoragePath: sourceDoc.storage_path,
          pageIndices: g.pageIndices,
          outputDisplayName: g.name,
          sourceFileName: sourceDoc.filename,
        });
        if (!created.ok) {
          toast.error(created.error);
          return;
        }
        const newId = created.id;
        if (g.checklistItem?.id) {
          const ok = await attachDocumentToChecklistItem(newId, g.checklistItem.id);
          if (!ok) {
            toast.error("A split was saved but could not be attached to the checklist item.");
            return;
          }
        }
      }
      toast.success("Split outputs saved");
      goToTransaction();
    } finally {
      setSavingSplits(false);
    }
  }, [transactionId, sourceDoc, splitGroups, goToTransaction]);

  function handleDoneClick() {
    if (pageSlots.length === 0) {
      void persistSplitOutputsAndExit();
      return;
    }
    if (unassignedPages.length > 0) {
      setDoneConfirmOpen(true);
      return;
    }
    void persistSplitOutputsAndExit();
  }

  function togglePage(page: number) {
    setSelectedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page].sort((a, b) => a - b)
    );
  }

  function createSplitFromSelection() {
    if (selectedPages.length === 0) {
      toast.error("Select at least one page");
      return;
    }
    const pages = [...selectedPages].sort((a, b) => a - b);
    setSplitGroups((prev) => [
      ...prev,
      {
        id: newGroupId(),
        name: suggestedSplitOutputName(pages, null),
        pageIndices: pages,
        checklistItem: null,
        outputNameUserEdited: false,
      },
    ]);
    setSelectedPages([]);
    toast.success("Split output added");
  }

  function updateGroup(id: string, patch: Partial<SplitOutputGroup>) {
    setSplitGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGroup(id: string) {
    setSplitGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function handleLabeledOutputName(groupId: string, label: string) {
    const t = label.trim();
    if (!t) return;
    updateGroup(groupId, { name: t, outputNameUserEdited: true });
  }

  function handleChecklistSelectForGroup(groupId: string, item: ChecklistItem) {
    setSplitGroups((prev) =>
      prev.map((gr) => {
        if (gr.id !== groupId) return gr;
        if (gr.outputNameUserEdited) {
          return { ...gr, checklistItem: item };
        }
        return {
          ...gr,
          checklistItem: item,
          name: suggestedSplitOutputName(gr.pageIndices, item),
        };
      })
    );
  }

  if (!transactionId || !documentId) {
    return <Navigate to="/transactions" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  if (!transaction || !sourceDoc) {
    return (
      <div className="min-h-[50vh] bg-slate-50 p-6">
        <p className="text-sm text-slate-600">Document not found for this transaction.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={transactionId ? `/transactions/${transactionId}` : "/transactions"}>Back</Link>
        </Button>
      </div>
    );
  }

  const txnLabel =
    transaction.identifier?.trim() ||
    transaction.clientname?.trim() ||
    [transaction.sellernames, transaction.buyernames].filter(Boolean).join(" · ") ||
    "Transaction";

  const sourceIsImage = isImageFilename(sourceDoc.filename);
  const showPdfIframe = Boolean(previewUrl && !sourceIsImage);
  const showImagePreview = Boolean(previewUrl && sourceIsImage);

  const pagesMetaText = sourceIsImage
    ? "1 page"
    : !previewUrl
      ? "…"
      : pdfNumPagesLoading
        ? "…"
        : pdfNumPagesError
          ? "—"
          : pdfNumPages != null
            ? `${pdfNumPages} page${pdfNumPages === 1 ? "" : "s"}`
            : "…";

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-12 md:p-6">
      <AlertDialog open={doneConfirmOpen} onOpenChange={setDoneConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassigned pages</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  Some pages are not included in any split output yet. Those pages will stay only in the original
                  source document and will not receive new split files.
                </p>
                <p className="font-medium text-slate-800">
                  Unassigned: {summarizePageNumbers(unassignedPages)}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingSplits}>Go back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-900 text-white hover:bg-slate-800"
              disabled={savingSplits}
              onClick={(e) => {
                e.preventDefault();
                setDoneConfirmOpen(false);
                void persistSplitOutputsAndExit();
              }}
            >
              {savingSplits ? "Saving…" : "Done anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2 text-slate-600" asChild>
            <Link to={`/transactions/${transactionId}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to transaction
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Split this document</h1>
            <p className="mt-1 text-sm font-medium text-slate-800">{sourceDoc.filename}</p>
            <p className="text-xs text-slate-500">{txnLabel}</p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {/* LEFT — source preview + page strip */}
          <Card className="border-slate-200/90 shadow-sm lg:sticky lg:top-4">
            <CardHeader className="space-y-0 border-b border-slate-100 pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Source document</CardTitle>
                {previewUrl ? (
                  <Button type="button" variant="outline" size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto" asChild>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Open in new tab
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div
                className={cn(
                  "relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100/80",
                  "aspect-[8.5/11] max-h-[min(52vh,560px)] w-full"
                )}
              >
                {showPdfIframe && previewUrl ? (
                  <iframe
                    title="Source PDF preview"
                    src={previewUrl}
                    className="h-full w-full border-0"
                  />
                ) : showImagePreview && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-slate-500">
                    <FileText className="h-12 w-12 text-slate-300" aria-hidden />
                    <span>Preview area</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    disabled={isReadOnly || selectedPages.length === 0}
                    onClick={createSplitFromSelection}
                  >
                    <Layers className="mr-2 h-4 w-4" aria-hidden />
                    Create split from selection
                  </Button>
                </div>
                {selectedPages.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {selectedPages.length === 1
                      ? `Page ${selectedPages[0]} selected for the next split`
                      : `${selectedPages.length} pages selected (${Math.min(...selectedPages)}–${Math.max(...selectedPages)})`}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium text-slate-700">Pages</Label>
                  <span className="text-xs text-slate-500">{pagesMetaText}</span>
                </div>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-slate-100 bg-white p-2">
                  {pageSlots.map((p) => {
                    const isSelected = selectedPages.includes(p);
                    const isAssigned = assignedPageSet.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePage(p)}
                        className={cn(
                          "relative flex h-14 w-11 shrink-0 flex-col items-center justify-center rounded-md border text-xs font-medium transition-colors",
                          isSelected &&
                            "z-[1] border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-500/35 ring-offset-2",
                          !isSelected &&
                            isAssigned &&
                            "border border-dashed border-violet-300/90 bg-gradient-to-b from-violet-50/90 to-slate-100/95 text-violet-900/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-inset ring-violet-200/70",
                          !isSelected && !isAssigned && "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        )}
                      >
                        {isAssigned && (
                          <span
                            className={cn(
                              "absolute left-0.5 top-0.5 rounded-full px-1 py-px text-[7px] font-bold uppercase leading-none tracking-wide",
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-violet-200/95 text-violet-900 shadow-sm"
                            )}
                          >
                            Split
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-[10px] uppercase",
                            isSelected ? "text-blue-100" : "text-slate-400"
                          )}
                        >
                          Pg
                        </span>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT — split workspace */}
          <div className="space-y-4">
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-base">Split outputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {!checklistTemplateId && (
                  <p className="text-sm text-slate-500">
                    No checklist template on this transaction — add one on the transaction page to enable checklist
                    assignment for outputs.
                  </p>
                )}
                {splitGroups.length === 0 ? (
                  <p className="text-sm text-slate-500">No outputs yet — select pages and create a split.</p>
                ) : (
                  splitGroups.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label className="text-xs text-slate-500">Output name</Label>
                          <Input
                            value={g.name}
                            onChange={(e) =>
                              updateGroup(g.id, { name: e.target.value, outputNameUserEdited: true })
                            }
                            className="h-9 text-sm"
                            disabled={isReadOnly}
                          />
                          <p className="text-xs text-slate-500">
                            Pages:{" "}
                            {g.pageIndices.length
                              ? [...g.pageIndices].sort((a, b) => a - b).join(", ")
                              : "—"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                          title="Remove output"
                          disabled={isReadOnly}
                          onClick={() => removeGroup(g.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove output</span>
                        </Button>
                      </div>

                      <div>
                        <Label
                          htmlFor={`split-out-${g.id}`}
                          className="mb-2 block text-sm font-medium text-slate-700"
                        >
                          Assign or label output
                        </Label>
                        <ChecklistItemSearchPicker
                          id={`split-out-${g.id}`}
                          items={checklistItems}
                          selectedItem={g.checklistItem}
                          onSelect={(item) => handleChecklistSelectForGroup(g.id, item)}
                          disabled={isReadOnly}
                          placeholder="Checklist item or labeled name…"
                          onSaveAsLabeledDocument={(label) => handleLabeledOutputName(g.id, label)}
                          saveAsLabeledAllowed={!isReadOnly}
                        />
                      </div>
                    </div>
                  ))
                )}

              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isReadOnly || savingSplits}
                onClick={handleDoneClick}
              >
                {savingSplits ? "Saving…" : "Done"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
