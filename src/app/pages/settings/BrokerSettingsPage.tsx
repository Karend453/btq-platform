import { Building2, CreditCard, Settings, User, Users, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountInfoTab } from "./AccountInfoTab";
import { ManageSubagentsTab } from "./ManageSubagentsTab";
import { MyOfficeTab } from "./MyOfficeTab";
import { MySubscriptionsTab } from "./MySubscriptionsTab";
import { MyWalletTab } from "./MyWalletTab";
const TAB_CONFIG = [
  { value: "office", label: "My Office", icon: Building2 },
  { value: "subscriptions", label: "My Subscriptions", icon: CreditCard },
  { value: "wallet", label: "My Wallet", icon: Wallet },
  { value: "account", label: "Account Info", icon: User },
  { value: "subagents", label: "Manage Subagents", icon: Users },
] as const;

/** Broker-only settings shell (v1). Route layout may evolve; tabs are the product contract. */
export function BrokerSettingsPage() {
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

        <Tabs defaultValue="office" className="w-full gap-4">
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
            <ManageSubagentsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
