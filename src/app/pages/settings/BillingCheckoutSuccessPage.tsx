import React from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Post–Stripe Checkout success (v1: display session id only). */
export function BillingCheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900">Payment successful</h1>
      <p className="mt-2 text-slate-600">
        Thank you. Your subscription checkout completed.
      </p>
      <p className="mt-3 text-sm text-slate-500">
        Your office billing record is updated from Stripe in the background—no need to do anything
        else here.
      </p>
      {sessionId ? (
        <p className="mt-4 text-sm text-slate-500 break-all">
          <span className="font-medium text-slate-700">Session ID:</span> {sessionId}
        </p>
      ) : null}
      <Link
        to="/settings"
        className="mt-6 inline-block text-sm font-medium text-slate-900 underline underline-offset-2 hover:text-slate-700"
      >
        Back to settings
      </Link>
    </div>
  );
}
