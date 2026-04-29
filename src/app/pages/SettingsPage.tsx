import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, Settings, User } from "lucide-react";
import { getCurrentUserProfileSnapshot, type UserProfileSnapshot } from "../../services/auth";
import { useAuth } from "../contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AccountInfoTab } from "./settings/AccountInfoTab";
import { BrokerSettingsPage } from "./settings/BrokerSettingsPage";
import { FormsProviderTab } from "./settings/FormsProviderTab";
import { SettingsProfileProvider } from "./settings/SettingsProfileContext";

const NON_BROKER_TAB_CONFIG = [
  { value: "account", label: "Account Info", icon: User },
  { value: "forms-provider", label: "Forms Provider", icon: FileSignature },
] as const;

const NON_BROKER_DEFAULT_TAB = "account";

function profileRoleKeyFromRow(
  p: UserProfileSnapshot | null
): "admin" | "agent" | "broker" | "btq_admin" | null {
  const r = (p?.role ?? "").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "agent") return "agent";
  if (r === "broker") return "broker";
  if (r === "btq_admin") return "btq_admin";
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

  if (roleKey === "broker" || roleKey === "btq_admin") {
    return (
      <SettingsProfileProvider profile={profile}>
        <BrokerSettingsPage showReadOnlyTemplatesTab={roleKey === "btq_admin"} />
      </SettingsProfileProvider>
    );
  }

  return (
    <SettingsProfileProvider profile={profile}>
      <NonBrokerSettingsShell />
    </SettingsProfileProvider>
  );
}

/** Tabbed settings shell for admin / agent / unrecognized roles. Forms Provider is exposed to all. */
function NonBrokerSettingsShell() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabValueSet = useMemo(
    () => new Set(NON_BROKER_TAB_CONFIG.map((t) => t.value)),
    []
  );

  const activeTab = useMemo(() => {
    const raw = searchParams.get("tab")?.trim() ?? "";
    return tabValueSet.has(raw) ? raw : NON_BROKER_DEFAULT_TAB;
  }, [searchParams, tabValueSet]);

  const setTab = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === NON_BROKER_DEFAULT_TAB) {
          next.delete("tab");
        } else {
          next.set("tab", value);
        }
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-slate-600 shrink-0" />
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
            <p className="text-slate-600 mt-1">Manage your personal account information.</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setTab} className="w-full gap-4">
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <TabsList className="inline-flex h-auto min-h-9 w-max max-w-full flex-wrap justify-start gap-1 p-1">
              {NON_BROKER_TAB_CONFIG.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1.5 px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="account" className="mt-4">
            <AccountInfoTab />
          </TabsContent>
          <TabsContent value="forms-provider" className="mt-4">
            <FormsProviderTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
