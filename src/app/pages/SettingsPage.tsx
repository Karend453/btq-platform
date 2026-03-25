import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { getCurrentUserProfileSnapshot, type UserProfileSnapshot } from "../../services/auth";
import { useAuth } from "../contexts/AuthContext";
import { AccountInfoTab } from "./settings/AccountInfoTab";
import { BrokerSettingsPage } from "./settings/BrokerSettingsPage";
import { SettingsProfileProvider } from "./settings/SettingsProfileContext";

function profileRoleKeyFromRow(
  p: UserProfileSnapshot | null
): "admin" | "agent" | "broker" | null {
  const r = (p?.role ?? "").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "agent") return "agent";
  if (r === "broker") return "broker";
  return null;
}

/** v1: single `/settings` route; broker shell vs generic placeholder. Final routing TBD. */
export function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfileSnapshot | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    getCurrentUserProfileSnapshot().then((row) => {
      if (!cancelled) setProfile(row);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  if (authLoading || profile === undefined) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-slate-600">Loading settings…</p>
        </div>
      </div>
    );
  }

  const roleKey = profileRoleKeyFromRow(profile);

  if (roleKey === "broker") {
    return (
      <SettingsProfileProvider profile={profile}>
        <BrokerSettingsPage />
      </SettingsProfileProvider>
    );
  }

  return (
    <SettingsProfileProvider profile={profile}>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="h-8 w-8 text-slate-600 shrink-0" />
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
              <p className="text-slate-600 mt-1">Manage your personal account information.</p>
            </div>
          </div>
          <AccountInfoTab />
        </div>
      </div>
    </SettingsProfileProvider>
  );
}
