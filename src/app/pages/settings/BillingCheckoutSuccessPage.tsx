import React from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";

/** Post–Stripe Checkout: confirm payment and point users to sign-in or settings. */
export function BillingCheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/?welcome=1" replace />;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Payment succeeded</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          You&apos;re all set
        </h1>
        <p className="mt-3 text-slate-600">
          Your subscription payment went through. Your office billing details will finish updating
          in the background—this usually takes a minute.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Sign in</span> with the same email you used
          to register to open your office and continue setup.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/login">Sign in to continue</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/signup">Back to signup</Link>
          </Button>
        </div>
        {sessionId ? (
          <p className="mt-6 text-xs text-slate-400 break-all">
            Reference: {sessionId}
          </p>
        ) : null}
      </div>
    </div>
  );
}
