import React from "react";
import { User } from "lucide-react";
import { getUserDisplayName, useAuth } from "../../contexts/AuthContext";
import { useSettingsProfile } from "./SettingsProfileContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-900 min-w-0 break-words">{display}</dd>
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

/** Read-only personal account details (not office / brokerage). */
export function AccountInfoTab() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useSettingsProfile();

  const loading = authLoading;
  const profileDisplayName = profile?.display_name?.trim();
  const displayName =
    profileDisplayName && profileDisplayName !== "" ? profileDisplayName : getUserDisplayName(user);
  const email = profile?.email?.trim() || user?.email?.trim() || null;
  const roleDisplay = roleLabelForDisplay(profile?.role);
  const phone =
    user?.phone && String(user.phone).trim() !== "" ? String(user.phone).trim() : null;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <User className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Account Info</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-600">Loading account…</p>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-slate-900 text-sm">Account details</p>
              <dl className="space-y-2.5">
                <ReadonlyField label="Display name" value={displayName || null} />
                <ReadonlyField label="Email" value={email} />
                <ReadonlyField label="Role" value={roleDisplay} />
                {phone ? <ReadonlyField label="Phone" value={phone} /> : null}
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
