import React, { useEffect, useState } from "react";
import { User } from "lucide-react";
import {
  DEFAULT_PERSONAL_GCI_GOAL,
  setPersonalGciGoal,
} from "../../../services/auth";
import { getUserDisplayName, useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { useSettingsProfile } from "./SettingsProfileContext";

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
  if (r === "btq_admin") return "BTQ Admin";
  return "—";
}

function formatUsd0(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Read-only personal account details (not office / brokerage). */
export function AccountInfoTab() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useSettingsProfile();

  const [goalInput, setGoalInput] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalSavedHint, setGoalSavedHint] = useState(false);

  useEffect(() => {
    const raw = profile?.personal_gci_goal;
    if (raw != null && Number.isFinite(Number(raw))) {
      setGoalInput(String(Number(raw)));
    } else {
      setGoalInput("");
    }
  }, [profile?.personal_gci_goal]);

  const loading = authLoading;
  const profileDisplayName = profile?.display_name?.trim();
  const displayName =
    profileDisplayName && profileDisplayName !== "" ? profileDisplayName : getUserDisplayName(user);
  const email = profile?.email?.trim() || user?.email?.trim() || null;
  const roleDisplay = roleLabelForDisplay(profile?.role);
  const phone =
    user?.phone && String(user.phone).trim() !== "" ? String(user.phone).trim() : null;

  async function handleSavePersonalGciGoal() {
    setGoalError(null);
    setGoalSavedHint(false);
    const trimmed = goalInput.trim().replace(/,/g, "");
    let payload: number | null;
    if (trimmed === "") {
      payload = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        setGoalError("Enter a positive amount or leave blank to use the default goal.");
        return;
      }
      payload = n;
    }

    setGoalSaving(true);
    try {
      const result = await setPersonalGciGoal(payload);
      if (!result.ok) {
        setGoalError(result.message);
        return;
      }
      setGoalSavedHint(true);
      window.setTimeout(() => setGoalSavedHint(false), 2500);
    } finally {
      setGoalSaving(false);
    }
  }

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

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <p className="font-medium text-slate-900 text-sm">Personal GCI Goal</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Optional annual goal for your Client Portfolio progress. Leave blank to use the default (
                  {formatUsd0(DEFAULT_PERSONAL_GCI_GOAL)}).
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <label className="sr-only" htmlFor="personal-gci-goal">
                    Personal GCI Goal
                  </label>
                  <Input
                    id="personal-gci-goal"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={formatUsd0(DEFAULT_PERSONAL_GCI_GOAL)}
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    disabled={goalSaving || loading}
                    className="sm:max-w-xs border-slate-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSavePersonalGciGoal()}
                    disabled={goalSaving || loading}
                  >
                    {goalSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                {goalError ? (
                  <p className="text-xs text-red-600" role="alert">
                    {goalError}
                  </p>
                ) : null}
                {goalSavedHint ? (
                  <p className="text-xs text-slate-600">Saved.</p>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
