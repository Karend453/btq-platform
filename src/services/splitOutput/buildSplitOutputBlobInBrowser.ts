/**
 * Phase 2A — browser-side split artifact generation (pdf-lib).
 *
 * Replaceable boundary: persistence (`insertSplitOutputDocument`) should only depend on this module’s
 * public types + `buildSplitOutputBlobInBrowser`. A future Supabase Edge Function can implement
 * `requestSplitOutputFromEdgeFunction(...)` returning the same result shape, with minimal changes at the call site.
 */

import { PDFDocument } from "pdf-lib";

/** ~40MB cap: limits duplicate ArrayBuffers + pdf-lib working memory in a single tab (tune with real-world metrics). */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Hard cap on source PDF page count before we attempt copyPages (avoids pathological documents freezing the UI). */
const MAX_PDF_SOURCE_PAGES = 400;

export type BuildSplitOutputBlobInBrowserParams = {
  sourceBlob: Blob;
  /** Display/storage filename for the source (extension used for image vs PDF routing). */
  sourceFileName: string;
  /** 1-based page indices from the split workspace (may contain duplicates; normalized internally). */
  pageIndices: number[];
};

export type BuildSplitOutputBlobInBrowserOk = {
  ok: true;
  blob: Blob;
  /** Same order as pages in the output PDF; deduped and sorted ascending (canonical “normalized” selection). */
  normalizedPageIndices: number[];
  /** MIME type for Storage `contentType` on upload. */
  contentType: string;
};

export type BuildSplitOutputBlobInBrowserErr = {
  ok: false;
  error: string;
};

export type BuildSplitOutputBlobInBrowserResult =
  | BuildSplitOutputBlobInBrowserOk
  | BuildSplitOutputBlobInBrowserErr;

function isImageFileName(name: string): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(name);
}

function contentTypeForImageOutput(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Validate, dedupe, and sort ascending (canonical order for DB + output PDF page sequence).
 * Rejects invalid entries instead of silently dropping them.
 */
export function parseAndNormalizeSplitPageIndices(
  pageIndices: number[]
): { ok: true; normalized: number[] } | { ok: false; error: string } {
  if (pageIndices.length === 0) {
    console.warn("[Phase2A][split] rejected: empty page selection");
    return { ok: false, error: "No pages selected for this split." };
  }
  for (const p of pageIndices) {
    if (!Number.isFinite(p) || !Number.isInteger(p)) {
      console.warn("[Phase2A][split] rejected: non-integer page", p);
      return { ok: false, error: "Invalid page selection — page numbers must be whole numbers." };
    }
    if (p < 1) {
      console.warn("[Phase2A][split] rejected: page < 1", p);
      return { ok: false, error: "Page numbers must be 1 or greater." };
    }
  }
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const p of pageIndices) {
    const n = p as number;
    if (seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }
  unique.sort((a, b) => a - b);
  return { ok: true, normalized: unique };
}

/**
 * Build the Storage blob for a split output in the browser.
 *
 * - PDF: true subset PDF via pdf-lib (selected pages only, order = normalized ascending order).
 * - Images: passthrough only when the normalized selection is exactly page 1 (UI exposes a single page).
 * - Other types: fail (no fake “split”).
 */
export async function buildSplitOutputBlobInBrowser(
  params: BuildSplitOutputBlobInBrowserParams
): Promise<BuildSplitOutputBlobInBrowserResult> {
  const { sourceBlob, sourceFileName, pageIndices } = params;
  const parsed = parseAndNormalizeSplitPageIndices(pageIndices);
  if (!parsed.ok) return parsed;
  const normalized = parsed.normalized;

  const size = sourceBlob.size;
  if (size > MAX_SOURCE_BYTES) {
    console.warn("[Phase2A][split] rejected: source too large (bytes)", size);
    return {
      ok: false,
      error: `This file is too large to split in the browser (max ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MB). Try a smaller PDF or contact support.`,
    };
  }

  if (isImageFileName(sourceFileName)) {
    const onlyPageOne = normalized.length === 1 && normalized[0] === 1;
    if (!onlyPageOne) {
      console.warn("[Phase2A][split] rejected: non-page-1 selection on image source", normalized);
      return {
        ok: false,
        error: "Splitting multi-page documents is only supported for PDFs. This image has a single page.",
      };
    }
    return {
      ok: true,
      blob: sourceBlob,
      normalizedPageIndices: [1],
      contentType: contentTypeForImageOutput(sourceFileName),
    };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await sourceBlob.arrayBuffer();
  } catch (e) {
    console.error("[Phase2A][split] failed to read source blob", e);
    return {
      ok: false,
      error: "Could not read the downloaded file in your browser. Try again.",
    };
  }

  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    console.warn("[Phase2A][split] rejected: buffer larger than cap after read", bytes.byteLength);
    return {
      ok: false,
      error: `This file is too large to split in the browser (max ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MB).`,
    };
  }

  try {
    const srcDoc = await PDFDocument.load(bytes);
    const pageCount = srcDoc.getPageCount();

    if (pageCount > MAX_PDF_SOURCE_PAGES) {
      console.warn("[Phase2A][split] rejected: too many pages", pageCount);
      return {
        ok: false,
        error: `This PDF has too many pages to split here (${pageCount} pages; max ${MAX_PDF_SOURCE_PAGES}). Contact support if you need help.`,
      };
    }

    for (const oneBased of normalized) {
      if (oneBased > pageCount) {
        console.warn("[Phase2A][split] rejected: page out of range", { oneBased, pageCount });
        return {
          ok: false,
          error: `Page ${oneBased} is out of range (this document has ${pageCount} page${pageCount === 1 ? "" : "s"}).`,
        };
      }
    }

    const outDoc = await PDFDocument.create();
    for (const oneBased of normalized) {
      const [copied] = await outDoc.copyPages(srcDoc, [oneBased - 1]);
      outDoc.addPage(copied);
    }

    const outBytes = await outDoc.save();
    return {
      ok: true,
      blob: new Blob([outBytes], { type: "application/pdf" }),
      normalizedPageIndices: normalized,
      contentType: "application/pdf",
    };
  } catch (e) {
    console.error("[Phase2A][split] PDF load or subset build failed", e);
    return {
      ok: false,
      error:
        "Could not read or split this PDF. It may be corrupted, password-protected, or not a supported PDF.",
    };
  }
}
