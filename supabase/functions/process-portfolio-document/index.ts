import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProcessRequest = {
  documentId: string;
};

type TransactionDocumentRow = {
  id: string;
  transaction_id: string;
  file_name: string | null;
  storage_path: string | null;
  use_for_portfolio_update: boolean;
  portfolio_update_type: string | null;
  portfolio_extracted_data: Record<string, unknown> | null;
  portfolio_applied_at: string | null;
  portfolio_review_status: string;
};

const EXTRACTOR_VERSION = "v2-filename-closing-final";

/** Closing / HUD / settlement — filename keyword gate for the v1 extractor. */
const CLOSING_FAMILY = /hud|closing|settlement|cd|alta/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log("[process-portfolio-document] RAW REQUEST HIT");

  const authHeader = req.headers.get("authorization");
  console.log("[process-portfolio-document] auth header:", authHeader);


  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing Supabase environment variables." },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let documentId = "";

try {
  const body = (await req.json()) as ProcessRequest;
  documentId = body.documentId;

  console.log("[process-portfolio-document] FUNCTION START", {
    documentId,
  });

  if (!documentId) {
    return jsonResponse({ error: "documentId is required." }, 400);
  }

  console.log("[process-portfolio-document] request received", {
    documentId,
  });

  // 1) Load document
  const { data: doc, error: docError } = await supabase
    .from("transaction_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Failed loading transaction_documents: ${docError?.message ?? "Not found"}`);
  }

  console.log("[process-portfolio-document] DOCUMENT LOADED", {
    documentId: doc.id,
    fileName: doc.file_name,
    storagePath: doc.storage_path,
    transactionId: doc.transaction_id,
  });

    // 2) Log start
    await insertProcessingLog(supabase, {
      document_id: doc.id,
      transaction_id: doc.transaction_id,
      status: "started",
      extractor_version: EXTRACTOR_VERSION,
    });

    const extraction = extractClosingFinalFromFileName(doc.file_name);

    if (!extraction.ok) {
      console.log("[process-portfolio-document] skipped", {
        documentId: doc.id,
        transactionId: doc.transaction_id,
        reason: extraction.reason,
      });

      await insertProcessingLog(supabase, {
        document_id: doc.id,
        transaction_id: doc.transaction_id,
        status: "success",
        extractor_version: EXTRACTOR_VERSION,
      });

      console.log("[process-portfolio-document] processing log written", {
        status: "success",
        skipped: true,
        documentId: doc.id,
      });

      console.log("[process-portfolio-document] success response returned");

      return jsonResponse({
        success: true,
        skipped: true,
        reason: extraction.reason,
        documentId: doc.id,
        transactionId: doc.transaction_id,
      });
    }

    const extractedPayload = extraction.payload;
    const updateType = "final" as const;

    if (!isFinalRpcPayloadComplete(extractedPayload)) {
      const reason = finalPayloadIncompleteReason(extractedPayload);
      console.log(
        "[process-portfolio-document] finalization skipped (incomplete required fields)",
        {
          documentId: doc.id,
          transactionId: doc.transaction_id,
          reason,
          extractedKeys: Object.keys(extractedPayload),
        },
      );

      await insertProcessingLog(supabase, {
        document_id: doc.id,
        transaction_id: doc.transaction_id,
        status: "success",
        extractor_version: EXTRACTOR_VERSION,
        extracted_data: extractedPayload as Record<string, unknown>,
      });

      return jsonResponse({
        success: true,
        skipped: true,
        reason,
        documentId: doc.id,
        transactionId: doc.transaction_id,
      });
    }

    console.log("[process-portfolio-document] extracted (filename v2)", {
      updateType,
      fieldKeys: Object.keys(extractedPayload),
    });

    // 3) Persist extracted fields on the document row
    const { error: updateDocError } = await supabase
      .from("transaction_documents")
      .update({
        use_for_portfolio_update: true,
        portfolio_update_type: updateType,
        portfolio_extracted_data: extractedPayload,
        portfolio_review_status: "pending",
      })
      .eq("id", doc.id);

    if (updateDocError) {
      throw new Error(
        `Failed updating transaction_documents: ${updateDocError.message}`,
      );
    }

    console.log("[process-portfolio-document] transaction_documents updated", {
      documentId: doc.id,
    });

    // 4) Apply to portfolio (real payload only)
    console.log(
      "[process-portfolio-document] calling apply_document_to_portfolio RPC",
      {
        documentId: doc.id,
        transactionId: doc.transaction_id,
        updateType,
      },
    );

    const { data: applyResult, error: applyError } = await supabase.rpc(
      "apply_document_to_portfolio",
      {
        p_document_id: doc.id,
        p_transaction_id: doc.transaction_id,
        p_update_type: updateType,
        p_payload: extractedPayload,
      },
    );

    if (applyError) {
      console.error(
        "[process-portfolio-document] apply_document_to_portfolio RPC error",
        {
          message: applyError.message,
          details: applyError.details,
          hint: applyError.hint,
          code: applyError.code,
        },
      );
      throw new Error(`Portfolio apply failed: ${applyError.message}`);
    }

    console.log(
      "[process-portfolio-document] apply_document_to_portfolio RPC ok",
      { applyResult },
    );

    // 5) Mark document applied
    const { error: finalizeDocError } = await supabase
      .from("transaction_documents")
      .update({
        portfolio_applied_at: new Date().toISOString(),
        portfolio_review_status: "applied",
      })
      .eq("id", doc.id);

    if (finalizeDocError) {
      throw new Error(
        `Failed finalizing transaction_documents: ${finalizeDocError.message}`,
      );
    }

    // 6) Log success
    await insertProcessingLog(supabase, {
      document_id: doc.id,
      transaction_id: doc.transaction_id,
      status: "success",
      extractor_version: EXTRACTOR_VERSION,
      extracted_data: extractedPayload,
    });

    console.log("[process-portfolio-document] processing log written", {
      status: "success",
      skipped: false,
      documentId: doc.id,
    });

    console.log("[process-portfolio-document] success response returned");

    return jsonResponse({
      success: true,
      skipped: false,
      documentId: doc.id,
      transactionId: doc.transaction_id,
      updateType,
      extractedPayload,
      applyResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (documentId) {
      try {
        const { data: failedDoc } = await supabase
          .from("transaction_documents")
          .select("id, transaction_id")
          .eq("id", documentId)
          .single();

        if (failedDoc) {
          await insertProcessingLog(supabase, {
            document_id: failedDoc.id,
            transaction_id: failedDoc.transaction_id,
            status: "failed",
            extractor_version: EXTRACTOR_VERSION,
            error_message: message,
          });

          await supabase
            .from("transaction_documents")
            .update({ portfolio_review_status: "failed" })
            .eq("id", failedDoc.id);
        }
      } catch {
        // ignore logging failure in catch
      }
    }

    return jsonResponse({ success: false, error: message }, 500);
  }
});

/** Keys sent to apply_document_to_portfolio for p_update_type = 'final'. */
type FinalFilenamePayload = {
  property_address_primary: string;
  close_price: string;
  event_date: string;
  revenue_amount: string;
  /** Same ISO date as event_date; kept for rollout compatibility with older clients. */
  closing_date: string;
};

/**
 * v2: derive `final` portfolio fields from the upload file name only.
 * Expected pattern before extension:
 *   ..._<close_price>_<yyyy-mm-dd>_<revenue_amount>
 * where close_price is at least 5 digits, revenue_amount at least 4 digits, and the date is ISO.
 */
function extractClosingFinalFromFileName(
  fileName: string | null,
):
  | {
      ok: true;
      payload: FinalFilenamePayload;
    }
  | { ok: false; reason: string } {
  const name = fileName?.trim() ?? "";
  if (!name) {
    return {
      ok: false,
      reason:
        "No real extractor implemented yet for this document type",
    };
  }
  

  if (!CLOSING_FAMILY.test(name)) {
    return {
      ok: false,
      reason:
        "No real extractor implemented yet for this document type",
    };
  }

  const base = name.replace(/\.[^./\\]+$/u, "");
  const m = base.match(
    /^(.+)_(\d{5,})_(\d{4}-\d{2}-\d{2})_(\d{4,})$/u,
  );
  if (!m) {
    return {
      ok: false,
      reason:
        "Closing/settlement document: filename must end with _<close_price>_<yyyy-mm-dd>_<revenue_amount> before the extension (example: closing_123_Main_St_520000_2026-04-15_12500.pdf).",
    };
  }

  const property_address_primary = m[1].replace(/_/g, " ").trim();
  const close_price = m[2];
  const isoDate = m[3];
  const revenue_amount = m[4];

  if (!property_address_primary) {
    return {
      ok: false,
      reason:
        "Closing/settlement document: address segment missing before price, date, and revenue.",
    };
  }

  return {
    ok: true,
    payload: {
      property_address_primary,
      close_price,
      event_date: isoDate,
      closing_date: isoDate,
      revenue_amount,
    },
  };
}

function isFinalRpcPayloadComplete(p: FinalFilenamePayload): boolean {
  const price = p.close_price?.trim() ?? "";
  const eventDate = p.event_date?.trim() ?? "";
  const rev = p.revenue_amount?.trim() ?? "";
  return price.length > 0 && eventDate.length > 0 && rev.length > 0;
}

function finalPayloadIncompleteReason(p: FinalFilenamePayload): string {
  const missing: string[] = [];
  if (!(p.close_price?.trim() ?? "")) missing.push("close_price");
  if (!(p.event_date?.trim() ?? "")) missing.push("event_date");
  if (!(p.revenue_amount?.trim() ?? "")) missing.push("revenue_amount");
  return `Finalization skipped: missing required extracted field(s): ${missing.join(", ")}.`;
}

async function insertProcessingLog(
  supabase: ReturnType<typeof createClient>,
  row: {
    document_id: string;
    transaction_id: string;
    status: "started" | "success" | "failed";
    extractor_version: string;
    extracted_data?: Record<string, unknown>;
    error_message?: string;
  },
) {
  const { error } = await supabase
    .from("document_processing_logs")
    .insert(row);

  if (error) {
    throw new Error(`Failed inserting processing log: ${error.message}`);
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
