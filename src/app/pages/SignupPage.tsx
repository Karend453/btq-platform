import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useAuth } from "../contexts/AuthContext";
import {
  completeBrokerSignup,
  signOut,
  signUpWithPassword,
} from "../../services/auth";
import {
  PLAN_DETAILS,
  parsePlanKey,
  planKeyToBrokerPlanKey,
  type PlanKey,
} from "../../lib/pricingPlans";
import { createBrokerCheckout } from "../../services/billing";
import { Textarea } from "../components/ui/textarea";

/** Set when broker checkout fails after signup; blocks `<Navigate to="/">` until retry or successful payment. */
const SIGNUP_CHECKOUT_FAILED_KEY = "btq_signup_checkout_failed";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function SignupPage() {
  const { user, loading: authLoading, error: authEnvError } = useAuth();
  const [params] = useSearchParams();
  const planParam = params.get("plan");
  const planKey = useMemo(() => parsePlanKey(planParam), [planParam]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [firmName, setFirmName] = useState("");
  const [firmAddress, setFirmAddress] = useState("");
  const [teamName, setTeamName] = useState("");
  const [licensedStates, setLicensedStates] = useState("");
  const [mlsName, setMlsName] = useState("");
  const [mlsUrl, setMlsUrl] = useState("");
  const [landvoiceLeads, setLandvoiceLeads] = useState("");
  const [referral, setReferral] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  /** True while signup → provision → Stripe redirect is in flight; avoids Navigate to "/" before checkout. */
  const brokerCheckoutPendingRef = useRef(false);
  const [checkoutFailedBlocksHome, setCheckoutFailedBlocksHome] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SIGNUP_CHECKOUT_FAILED_KEY) === "1";
  });
  const hadUserRef = useRef(!!user);

  useEffect(() => {
    if (hadUserRef.current && !user) {
      sessionStorage.removeItem(SIGNUP_CHECKOUT_FAILED_KEY);
      setCheckoutFailedBlocksHome(false);
    }
    hadUserRef.current = !!user;
  }, [user]);

  const effectivePlan: PlanKey = planKey ?? "core";
  const planSummary = PLAN_DETAILS[effectivePlan];

  if (
    !authLoading &&
    user &&
    !brokerCheckoutPendingRef.current &&
    !checkoutFailedBlocksHome
  ) {
    return <Navigate to="/" replace />;
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (authEnvError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <p className="text-destructive">{authEnvError}</p>
      </div>
    );
  }

  if (!authLoading && user && brokerCheckoutPendingRef.current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
        <p className="text-lg font-semibold text-slate-900">Taking you to secure checkout…</p>
        <p className="mt-2 max-w-md text-center text-sm text-slate-600">
          Hang tight while we finish setting up your workspace and open Stripe.
        </p>
      </div>
    );
  }

  if (needsEmailConfirm) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-6 py-4">
            <Link
              to="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              ← Pricing
            </Link>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-lg px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Confirm your email</h1>
          <p className="mt-3 text-muted-foreground">
            We sent a link to <span className="font-medium text-foreground">{email}</span>. After you
            confirm, sign in to finish activating your brokerage workspace.
          </p>
          <Button className="mt-8" asChild>
            <Link to="/login">Go to sign in</Link>
          </Button>
        </main>
      </div>
    );
  }

  function validateSignupForm(): boolean {
    const next: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2) {
      next.fullName = "Enter your full name.";
    }
    if (!email.trim() || !validateEmail(email)) {
      next.email = "Enter a valid email address.";
    }
    if (!password || password.length < 8) {
      next.password = "Use at least 8 characters.";
    }
    if (!phone.trim()) {
      next.phone = "Enter a phone number.";
    }
    if (!firmName.trim()) {
      next.firmName = "Enter your firm or brokerage name.";
    }
    if (!firmAddress.trim()) {
      next.firmAddress = "Enter your firm’s street address.";
    }
    if (!teamName.trim()) {
      next.teamName = "Enter your team name.";
    }
    if (!licensedStates.trim()) {
      next.licensedStates = "Enter the state(s) where you’re licensed.";
    }
    if (!mlsName.trim()) {
      next.mlsName = "Enter your MLS name.";
    }
    if (!mlsUrl.trim()) {
      next.mlsUrl = "Enter your MLS website or member portal URL.";
    }
    if (!landvoiceLeads.trim()) {
      next.landvoiceLeads = "Describe your Landvoice lead needs or territory.";
    }
    console.log("fieldErrors", next);
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    console.log("*** ACTIVE handleSubmit fired ***");
    e.preventDefault();
    setSubmitError(null);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_FAILED_KEY);
    setCheckoutFailedBlocksHome(false);
    const isValid = validateSignupForm();
    console.log("validateSignupForm result", isValid);
    if (!isValid) {
      console.log("validation failed");
      return;
    }

    brokerCheckoutPendingRef.current = true;
    setSubmitting(true);

    console.log("[signup] step 1/3 signUpWithPassword: start");
    const signUpResult = await signUpWithPassword(email.trim(), password, {
      displayName: fullName.trim(),
    });
    console.log("[signup] step 1/3 signUpWithPassword: result", {
      success: signUpResult.success,
      sessionEstablished:
        signUpResult.success ? signUpResult.sessionEstablished : undefined,
    });

    if (!signUpResult.success) {
      console.warn("[signup] step 1/3 signUpWithPassword: failed", signUpResult.message);
      brokerCheckoutPendingRef.current = false;
      setSubmitting(false);
      setSubmitError(signUpResult.message);
      return;
    }

    if (!signUpResult.sessionEstablished) {
      console.log("[signup] step 1/3: email confirmation required, skipping RPC + checkout");
      brokerCheckoutPendingRef.current = false;
      setSubmitting(false);
      setNeedsEmailConfirm(true);
      return;
    }

    console.log("[signup] step 2/3 completeBrokerSignup (RPC): start");
    const provision = await completeBrokerSignup({
      displayName: fullName.trim(),
      officeName: firmName.trim(),
      teamName: teamName.trim(),
      firmAddress: firmAddress.trim(),
      state: licensedStates.trim(),
      mlsName: mlsName.trim(),
      mlsUrl: mlsUrl.trim(),
      landvoiceLeads: landvoiceLeads.trim(),
      referral: referral.trim() || null,
      brokerPhone: phone.trim(),
      planKey: effectivePlan,
    });
    console.log("[signup] step 2/3 completeBrokerSignup (RPC): result", {
      success: provision.success,
      officeId: provision.success ? provision.officeId : undefined,
    });

    if (!provision.success) {
      console.warn("[signup] step 2/3 completeBrokerSignup (RPC): failed", provision.message);
      await signOut();
      brokerCheckoutPendingRef.current = false;
      setSubmitting(false);
      setSubmitError(provision.message);
      return;
    }

    try {
      console.log("[signup] step 3/3 createBrokerCheckout: start", {
        officeId: provision.officeId,
        plan: planKeyToBrokerPlanKey(effectivePlan),
      });
      const checkout = await createBrokerCheckout({
        officeId: provision.officeId,
        officeName: firmName.trim(),
        brokerEmail: email.trim(),
        plan: planKeyToBrokerPlanKey(effectivePlan),
      });
      const url = checkout.url?.trim();
      if (!url) {
        throw new Error("Checkout did not return a payment link. Try again or contact support.");
      }
      console.log("[signup] step 3/3 createBrokerCheckout: redirecting to Stripe");
      window.location.href = url;
    } catch (err) {
      console.error("[signup] step 3/3 createBrokerCheckout: failed", err);
      brokerCheckoutPendingRef.current = false;
      sessionStorage.setItem(SIGNUP_CHECKOUT_FAILED_KEY, "1");
      setCheckoutFailedBlocksHome(true);
      setSubmitting(false);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unable to start checkout.";
      setSubmitError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3.5">
          <Link
            to="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Pricing
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,13.75rem)_minmax(0,1fr)] lg:items-start lg:gap-7">
          <aside className="space-y-3.5 lg:max-w-[13.75rem] lg:shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Broker signup
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              Set up your brokerage
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tell us about your brokerage so we can prepare your CRM, lead generation, and onboarding
              setup. You’ll continue to secure payment on Stripe.
            </p>
            {planKey ? (
              <div className="rounded-lg border border-border/70 bg-card px-3 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected plan
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-tight text-foreground">
                  {planSummary.label}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · ${planSummary.pricePerMonth}/mo
                  </span>
                </p>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{planSummary.tagline}</p>
              </div>
            ) : (
              <p className="text-xs leading-snug text-muted-foreground">
                <span>Brokerage plan · </span>
                <span className="font-semibold text-foreground">Core</span>
                {" · "}
                <Link
                  to="/pricing"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Change plan
                </Link>
              </p>
            )}
          </aside>

          <div className="min-w-0">
            <form onSubmit={handleSubmit}>
              <Card className="overflow-hidden border-border/80 shadow-sm">
                <CardHeader className="space-y-0.5 border-b border-border/70 bg-background px-4 pb-4 pt-3.5 md:px-5">
                  <CardTitle className="text-sm font-semibold">Brokerage profile</CardTitle>
                  <CardDescription className="text-xs leading-relaxed md:text-[13px]">
                    Account details we use for Lofty, Landvoice, and your BTQ workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-[1.35rem] p-4 md:p-5">
                  <div className="grid gap-[1.125rem] md:grid-cols-2 md:gap-x-[1.35rem] md:gap-y-[1.125rem]">
                    <div className="space-y-[1.125rem]">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full name</Label>
                        <Input
                          id="fullName"
                          autoComplete="name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          aria-invalid={!!fieldErrors.fullName}
                          className="h-11"
                        />
                        {fieldErrors.fullName && (
                          <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-invalid={!!fieldErrors.email}
                          className="h-11"
                        />
                        {fieldErrors.email && (
                          <p className="text-sm text-destructive">{fieldErrors.email}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          type="tel"
                          autoComplete="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          aria-invalid={!!fieldErrors.phone}
                          className="h-11"
                        />
                        {fieldErrors.phone && (
                          <p className="text-sm text-destructive">{fieldErrors.phone}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="firmName">Firm name</Label>
                        <Input
                          id="firmName"
                          autoComplete="organization"
                          value={firmName}
                          onChange={(e) => setFirmName(e.target.value)}
                          aria-invalid={!!fieldErrors.firmName}
                          className="h-11"
                        />
                        {fieldErrors.firmName && (
                          <p className="text-sm text-destructive">{fieldErrors.firmName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="teamName">Team name</Label>
                        <Input
                          id="teamName"
                          autoComplete="organization-title"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          aria-invalid={!!fieldErrors.teamName}
                          className="h-11"
                        />
                        {fieldErrors.teamName && (
                          <p className="text-sm text-destructive">{fieldErrors.teamName}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-[1.125rem]">
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          aria-invalid={!!fieldErrors.password}
                          className="h-11"
                        />
                        {fieldErrors.password && (
                          <p className="text-sm text-destructive">{fieldErrors.password}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="firmAddress">Firm address</Label>
                        <Input
                          id="firmAddress"
                          autoComplete="street-address"
                          value={firmAddress}
                          onChange={(e) => setFirmAddress(e.target.value)}
                          aria-invalid={!!fieldErrors.firmAddress}
                          className="h-11"
                        />
                        {fieldErrors.firmAddress && (
                          <p className="text-sm text-destructive">{fieldErrors.firmAddress}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="licensedStates">Licensed state(s)</Label>
                        <Input
                          id="licensedStates"
                          placeholder="e.g. CA, TX"
                          value={licensedStates}
                          onChange={(e) => setLicensedStates(e.target.value)}
                          aria-invalid={!!fieldErrors.licensedStates}
                          className="h-11"
                        />
                        {fieldErrors.licensedStates && (
                          <p className="text-sm text-destructive">{fieldErrors.licensedStates}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mlsName">MLS name</Label>
                        <Input
                          id="mlsName"
                          value={mlsName}
                          onChange={(e) => setMlsName(e.target.value)}
                          aria-invalid={!!fieldErrors.mlsName}
                          className="h-11"
                        />
                        {fieldErrors.mlsName && (
                          <p className="text-sm text-destructive">{fieldErrors.mlsName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mlsUrl">MLS URL</Label>
                        <Input
                          id="mlsUrl"
                          type="text"
                          inputMode="url"
                          placeholder="https://…"
                          value={mlsUrl}
                          onChange={(e) => setMlsUrl(e.target.value)}
                          aria-invalid={!!fieldErrors.mlsUrl}
                          className="h-11"
                        />
                        {fieldErrors.mlsUrl && (
                          <p className="text-sm text-destructive">{fieldErrors.mlsUrl}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-[0.9rem] border-t border-border/60 pt-[1.35rem]">
                    <div className="space-y-2">
                      <Label htmlFor="landvoiceLeads">Landvoice leads</Label>
                      <p className="text-xs leading-snug text-muted-foreground">
                        Tell us what areas or lead types you want — we’ll configure this for you.
                      </p>
                      <Textarea
                        id="landvoiceLeads"
                        placeholder="Territories, lead types, or volume you want Landvoice to support."
                        value={landvoiceLeads}
                        onChange={(e) => setLandvoiceLeads(e.target.value)}
                        aria-invalid={!!fieldErrors.landvoiceLeads}
                        className="min-h-[120px] resize-y text-base md:text-sm"
                      />
                      {fieldErrors.landvoiceLeads && (
                        <p className="text-sm text-destructive">{fieldErrors.landvoiceLeads}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="referral">Referral (optional)</Label>
                      <Input
                        id="referral"
                        placeholder="Who referred you, or how you found Brokerteq"
                        value={referral}
                        onChange={(e) => setReferral(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex w-full flex-col items-stretch gap-3 border-t border-border/70 bg-background px-4 pb-5 pt-5 md:px-5">
                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting}
                    className="w-full sm:ml-auto sm:w-auto sm:min-w-[200px]"
                  >
                    {submitting ? "Redirecting to payment…" : "Continue to secure checkout"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
