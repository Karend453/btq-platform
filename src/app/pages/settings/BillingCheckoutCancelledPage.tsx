import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";

/** User left Stripe Checkout without paying (matches `cancel_url` in create-checkout-session). */
export function BillingCheckoutCancelledPage() {
  const { user } = useAuth();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-600">Checkout not completed</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">No charge was made</h1>
        <p className="mt-3 text-slate-600">
          You left checkout before finishing. Your card was not charged and your subscription was
          not started.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          {user ? (
            <>
              Return to <span className="font-medium text-slate-800">Settings</span> when
              you&apos;re ready to try again.
            </>
          ) : (
            <>
              <span className="font-medium text-slate-800">Sign in</span> and open Settings to
              restart checkout, or go back to signup if you still need to create your account.
            </>
          )}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {user ? (
            <Button asChild>
              <Link to="/settings">Return to settings</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/signup">Back to signup</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
