import React from "react";
import { Link } from "react-router-dom";

/** User left Stripe Checkout without paying (matches `cancel_url` in create-checkout-session). */
export function BillingCheckoutCancelledPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900">Checkout cancelled</h1>
      <p className="mt-2 text-slate-600">
        No charge was made. You can return to settings to try again when you are ready.
      </p>
      <Link
        to="/settings"
        className="mt-6 inline-block text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-slate-700"
      >
        Back to settings
      </Link>
    </div>
  );
}
