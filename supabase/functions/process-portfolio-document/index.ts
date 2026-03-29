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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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
      .single<TransactionDocumentRow>();

    if (docError || !doc) {
      return jsonResponse(
        {
          error: "Document not found.",
          details: docError?.message ?? null,
        },
        404,
      );
    }

    console.log("[process-portfolio-document] document loaded", {
      id: doc.id,
      transactionId: doc.transaction_id,
    });

    // 2) Log start
    await insertProcessingLog(supabase, {
      document_id: doc.id,
      transaction_id: doc.transaction_id,
      status: "started",
      extractor_version: "unimplemented",
    });

    // 3) No real extractor yet — do not write portfolio fields or call apply_document_to_portfolio
    console.log(
      "[process-portfolio-document] skipped: no real extractor implemented",
      { documentId: doc.id, transactionId: doc.transaction_id },
    );

    // 4) Log success (skipped — no extracted data)
    await insertProcessingLog(supabase, {
      document_id: doc.id,
      transaction_id: doc.transaction_id,
      status: "success",
      extractor_version: "unimplemented",
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
      reason: "No real extractor implemented yet for this document type",
      documentId: doc.id,
      transactionId: doc.transaction_id,
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
            extractor_version: "unimplemented",
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
