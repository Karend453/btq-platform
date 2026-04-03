import type {
  CreateBrokerCheckoutInput,
  CreateBrokerCheckoutResponse,
} from "../types/billing";

/** Best-effort parse of API / edge error bodies (JSON or HTML) for UI + logs. */
function summarizeCheckoutErrorBody(status: number, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return `HTTP ${status} (empty body)`;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      const nested =
        o.error && typeof o.error === "object" && o.error !== null
          ? (o.error as Record<string, unknown>)
          : null;
      const msg =
        (typeof o.error === "string" && o.error) ||
        (typeof o.message === "string" && o.message) ||
        (nested && typeof nested.message === "string" && nested.message) ||
        (typeof o.details === "string" && o.details);
      if (msg) return `${msg}`;
    }
  } catch {
    /* not JSON */
  }
  const oneLine = trimmed.replace(/\s+/g, " ").slice(0, 400);
  return oneLine || `HTTP ${status}`;
}

export async function createBrokerCheckout(
  input: CreateBrokerCheckoutInput
): Promise<CreateBrokerCheckoutResponse> {
  const res = await fetch("/api/billing/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    const summary = summarizeCheckoutErrorBody(res.status, text);
    const uiMessage = `Checkout API failed (${res.status}): ${summary}`;
    console.error("[createBrokerCheckout] request failed", {
      status: res.status,
      bodyPreview: text.slice(0, 500),
      uiMessage,
    });
    throw new Error(uiMessage);
  }

  try {
    return (await res.json()) as CreateBrokerCheckoutResponse;
  } catch (e) {
    console.error("[createBrokerCheckout] JSON parse failed", e);
    throw new Error("Checkout returned an invalid response. Try again or contact support.");
  }
}
