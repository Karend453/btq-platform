import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { getCurrentOffice, type Office } from "../../../services/offices";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function OrganizationFields({ office }: { office: Office }) {
  return (
    <div className="space-y-3">
      <p className="font-medium text-slate-900 text-sm">Organization</p>
      <dl className="space-y-2.5">
        <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
          <dt className="text-slate-500 shrink-0">Office name</dt>
          <dd className="text-slate-900 min-w-0 break-words">{office.name}</dd>
        </div>
        {office.display_name?.trim() ? (
          <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
            <dt className="text-slate-500 shrink-0">Display name</dt>
            <dd className="text-slate-900 min-w-0 break-words">{office.display_name}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * Broker-facing subscription context (read-only). Office comes from `getCurrentOffice()`;
 * billing product data is not wired yet.
 */
export function MySubscriptionsTab() {
  const [office, setOffice] = useState<Office | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getCurrentOffice().then((row) => {
      if (!cancelled) setOffice(row);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = office === undefined;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <CreditCard className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">My Subscriptions</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-600">Loading…</p>
          ) : office ? (
            <OrganizationFields office={office} />
          ) : (
            <p className="text-slate-600 leading-relaxed">
              No office is linked to your account yet. When your brokerage assigns you to an office,
              that organization will show here as the context for your subscription.
            </p>
          )}

          <div className="space-y-2 pt-1 border-t border-slate-100">
            <p className="font-medium text-slate-900 text-sm">Subscription status</p>
            <p className="text-slate-600 leading-relaxed">
              Billing details will appear here once your subscription is connected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
