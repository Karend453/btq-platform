import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { getOfficeById, type Office } from "../../../services/offices";
import { useSettingsProfile } from "./SettingsProfileContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function formatOfficeAddress(o: Office): string | null {
  const line = [o.address_line1, [o.city, o.state].filter(Boolean).join(", "), o.postal_code]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return line.length ? line.join(" · ") : null;
}

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-900 min-w-0 break-words">{display}</dd>
    </div>
  );
}

/**
 * Broker-facing office profile (read-only). Office row comes from `user_profiles.office_id` → `offices.id`.
 */
export function MyOfficeTab() {
  const { profile } = useSettingsProfile();
  const [office, setOffice] = useState<Office | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const oid = profile?.office_id?.trim();
    if (!oid) {
      setOffice(null);
      return () => {
        cancelled = true;
      };
    }
    getOfficeById(oid).then((row) => {
      if (!cancelled) setOffice(row);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.office_id]);

  const loading = office === undefined;
  const addressLine = office ? formatOfficeAddress(office) : null;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <Building2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">My Office</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-600">Loading office…</p>
          ) : office ? (
            <div className="space-y-3">
              <p className="font-medium text-slate-900 text-sm">Office details</p>
              <dl className="space-y-2.5">
                <ReadonlyField label="Office name" value={office.name} />
                <ReadonlyField label="Display name" value={office.display_name} />
                <ReadonlyField label="State" value={office.state} />
                <ReadonlyField label="Address" value={addressLine} />
                <ReadonlyField label="Broker name" value={office.broker_name} />
                <ReadonlyField label="Broker email" value={office.broker_email} />
                <ReadonlyField label="MLS name" value={office.mls_name} />
              </dl>
            </div>
          ) : (
            <p className="text-slate-600 leading-relaxed">
              Your office isn&apos;t shown here yet. If you expected to see your brokerage, contact
              your administrator to confirm your office assignment.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
