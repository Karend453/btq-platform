import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useAuth } from "../contexts/AuthContext";
import { signOut } from "../../services/auth";
import { getCurrentOffice, type Office } from "../../services/offices";
import { createBrokerCheckout } from "../../services/billing";
import {
  PLAN_DETAILS,
  planKeyToBrokerPlanKey,
  resolvePlanKeyFromOfficeFields,
  type PlanKey,
} from "../../lib/pricingPlans";
import type { BillingCycle } from "../../lib/stripePrices";

/** Coerces the text column `offices.signup_billing_cycle` into a `BillingCycle`. Unknown / empty → monthly. */
function resolveSignupBillingCycle(raw: string | null | undefined): BillingCycle {
  return (raw ?? "").trim().toLowerCase() === "annual" ? "annual" : "monthly";
}

/**
 * Post-login billing gate: shown when a broker signed in without an active Stripe subscription
 * (e.g. confirmed email but never completed checkout on signup). Offers a single CTA that
 * re-opens Stripe Checkout for the plan + cadence the broker originally picked at signup,
 * captured on `offices.plan_tier` + `offices.signup_billing_cycle` by `resume_pending_broker_signup`.
 */
export function BillingRequiredPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [office, setOffice] = useState<Office | null>(null);
  const [loadingOffice, setLoadingOffice] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setOffice(null);
      setLoadingOffice(false);
      return;
    }
    setLoadingOffice(true);
    getCurrentOffice()
      .then((o) => {
        if (cancelled) return;
        setOffice(o);
      })
      .finally(() => {
        if (!cancelled) setLoadingOffice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const resolvedPlanKey: PlanKey =
    resolvePlanKeyFromOfficeFields(office?.plan_tier ?? office?.billing_plan_tier ?? null) ??
    "core";
  const resolvedBillingCycle: BillingCycle = resolveSignupBillingCycle(
    office?.signup_billing_cycle
  );
  const planLabel = PLAN_DETAILS[resolvedPlanKey].label;
  const cycleLabel = resolvedBillingCycle === "annual" ? "annual" : "monthly";

  async function handleStartCheckout() {
    if (!office || !user?.email) return;
    setError(null);
    setStarting(true);
    try {
      const checkout = await createBrokerCheckout({
        officeId: office.id,
        officeName: office.display_name?.trim() || office.name,
        brokerEmail: user.email,
        plan: planKeyToBrokerPlanKey(resolvedPlanKey),
        billing: resolvedBillingCycle,
      });
      const url = checkout.url?.trim();
      if (!url) {
        throw new Error("Checkout did not return a payment link. Try again or contact support.");
      }
      window.location.href = url;
    } catch (e) {
      setStarting(false);
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Unable to start checkout.";
      setError(msg);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Complete billing to continue</CardTitle>
          <CardDescription>
            Your brokerage workspace is ready. Finish secure checkout to activate your{" "}
            <span className="font-medium text-foreground">
              {planLabel} ({cycleLabel})
            </span>{" "}
            subscription and unlock BTQ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={loadingOffice || starting || !office}
            onClick={handleStartCheckout}
          >
            {starting
              ? "Redirecting to payment…"
              : loadingOffice
                ? "Loading your workspace…"
                : "Continue to secure checkout"}
          </Button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/pricing" className="underline-offset-4 hover:underline">
              Change plan
            </Link>
            <button
              type="button"
              className="underline-offset-4 hover:underline disabled:opacity-50"
              onClick={handleSignOut}
              disabled={starting}
            >
              Sign out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
