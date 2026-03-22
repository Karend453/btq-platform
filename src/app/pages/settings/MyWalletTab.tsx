import { useEffect, useState } from "react";
import { CreditCard, FileText, Wallet } from "lucide-react";
import { getAccountInfoReadonly, type AccountInfoReadonly } from "../../../services/auth";
import { getCurrentOffice, type Office } from "../../../services/offices";
import { getUserDisplayName, useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-slate-900 min-w-0 break-words">{display}</dd>
    </div>
  );
}

function roleLabelForDisplay(raw: string | null | undefined): string {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  return "—";
}

function officeLabelForDisplay(office: Office | null): string | null {
  if (!office) return null;
  const name = office.name?.trim();
  if (name) return name;
  const display = office.display_name?.trim();
  return display || null;
}

/**
 * Broker-facing wallet (read-only): the brokerage’s subscription/payment relationship with
 * Brokerteq. Identity and office come from existing profile/office services; no in-app billing yet.
 */
export function MyWalletTab() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<AccountInfoReadonly | null | undefined>(undefined);
  const [office, setOffice] = useState<Office | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    Promise.all([getAccountInfoReadonly(), getCurrentOffice()]).then(([p, o]) => {
      if (!cancelled) {
        setProfile(p);
        setOffice(o);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  const loading = authLoading || profile === undefined || office === undefined;
  const profileDisplayName = profile?.display_name?.trim();
  const displayName =
    profileDisplayName && profileDisplayName !== "" ? profileDisplayName : getUserDisplayName(user);
  const email = profile?.email?.trim() || user?.email?.trim() || null;
  const roleDisplay = roleLabelForDisplay(profile?.role);
  const officeName = office ? officeLabelForDisplay(office) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
        <Card className="border-slate-200 h-full">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug">My Wallet</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-600">Loading…</p>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-slate-900 text-sm">Billing overview</p>
                  
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3.5 space-y-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    On record
                  </p>
                  <p className="text-lg font-semibold text-slate-900 tracking-tight leading-snug">
                    {displayName?.trim() ? displayName : "—"}
                  </p>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="text-xs text-slate-500 shrink-0">Office</span>
                    <span className="font-medium text-slate-900 min-w-0 break-words">
                      {officeName?.trim() ? officeName : "—"}
                    </span>
                  </div>
                </div>

                <dl className="space-y-2.5">
                  <ReadonlyField label="Email" value={email} />
                  <ReadonlyField label="Role" value={roleDisplay} />
                </dl>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-100">
                <p className="font-medium text-slate-900 text-sm">Account &amp; access</p>

              </div>
            </>
          )}
        </CardContent>
        </Card>

        <Card className="border-slate-200 h-full">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <CreditCard className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug">Payment management</CardTitle>
              <CardDescription className="text-slate-600 text-sm leading-relaxed">
                In-app billing is coming soon.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div className="space-y-2.5">
            <p className="leading-relaxed">
              Billing management is not yet available in-app. Your Brokerteq subscription is
              currently managed directly with our team.
            </p>
            <p className="leading-relaxed">
              If you need to update payment details before the billing portal is connected, contact
              Brokerteq billing support using the button below. When self-serve billing goes live,
              <span className="font-medium text-slate-800"> Manage Billing</span> will open your
              secure portal here.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="button" className="w-full sm:w-auto" disabled>
              Manage Billing
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <a
                href="mailto:billing@brokerteq.com?subject=Billing%20inquiry"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact Billing Support
              </a>
            </Button>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Opens your email app to message Brokerteq billing.
          </p>
        </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug">Invoices &amp; history</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
            <p className="font-medium text-slate-800">No invoices to show</p>
            <p className="mt-2 text-slate-600 leading-relaxed max-w-md mx-auto">
              When your organization has billable activity in BTQ, invoices and payment history will
              appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
