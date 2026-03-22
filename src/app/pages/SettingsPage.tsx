import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { getUserProfileRoleKey } from "../../services/auth";
import { AccountInfoTab } from "./settings/AccountInfoTab";
import { BrokerSettingsPage } from "./settings/BrokerSettingsPage";

/** v1: single `/settings` route; broker shell vs generic placeholder. Final routing TBD. */
export function SettingsPage() {
  const [roleKey, setRoleKey] = useState<"admin" | "agent" | "broker" | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    getUserProfileRoleKey().then((key) => {
      if (!cancelled) setRoleKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (roleKey === undefined) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-slate-600">Loading settings…</p>
        </div>
      </div>
    );
  }

  if (roleKey === "broker") {
    return <BrokerSettingsPage />;
  }

  return (
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
  );
}
