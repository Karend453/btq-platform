import type {
    CreateBrokerCheckoutInput,
    CreateBrokerCheckoutResponse,
  } from "@/types/billing";
  
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
      throw new Error(text || "Failed to create checkout session");
    }
  
    return res.json();
  }