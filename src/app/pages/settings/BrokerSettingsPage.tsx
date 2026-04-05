import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, CreditCard, Settings, User, Users, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountInfoTab } from "./AccountInfoTab";
import { TeamManagementTab } from "./TeamManagementTab";
import { MyOfficeTab } from "./MyOfficeTab";
import { MySubscriptionsTab } from "./MySubscriptionsTab";
import { MyWalletTab } from "./MyWalletTab";
const TAB_CONFIG = [
  { value: "office", label: "My Office", icon: Building2 },
  { value: "subscriptions", label: "My Subscriptions", icon: CreditCard },
  { value: "wallet", label: "My Wallet", icon: Wallet },
  { value: "account", label: "Account Info", icon: User },
  { value: "subagents", label: "Team Management", icon: Users },
] as const;

const DEFAULT_TAB = "office";
const TAB_VALUE_SET = new Set<string>(TAB_CONFIG.map((t) => t.value));

/** Broker-only settings shell (v1). Route layout may evolve; tabs are the product contract. */
export function BrokerSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const raw = searchParams.get("tab")?.trim() ?? "";
    return TAB_VALUE_SET.has(raw) ? raw : DEFAULT_TAB;
  }, [searchParams]);

  const setTab = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === DEFAULT_TAB) {
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
        <div>
          <div className="flex items-center gap-3">
            <Settings className="h-8 w-8 text-slate-600 shrink-0" />
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
              <p className="text-slate-600 mt-1">
                Manage your brokerage settings and office information.
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setTab} className="w-full gap-4">
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <TabsList className="inline-flex h-auto min-h-9 w-max max-w-full flex-wrap justify-start gap-1 p-1">
              {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1.5 px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="office" className="mt-4">
            <MyOfficeTab />
          </TabsContent>
          <TabsContent value="subscriptions" className="mt-4">
            <MySubscriptionsTab />
          </TabsContent>
          <TabsContent value="wallet" className="mt-4">
            <MyWalletTab />
          </TabsContent>
          <TabsContent value="account" className="mt-4">
            <AccountInfoTab />
          </TabsContent>
          <TabsContent value="subagents" className="mt-4">
            <TeamManagementTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
