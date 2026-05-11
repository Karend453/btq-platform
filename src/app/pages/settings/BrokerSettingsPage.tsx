import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  FileSignature,
  Layers,
  Settings,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountInfoTab } from "./AccountInfoTab";
import { FormsProviderTab } from "./FormsProviderTab";
import {
  OfficeChecklistTemplatesTab,
  type OfficeChecklistTemplatesTabProps,
} from "./OfficeChecklistTemplatesTab";
import { TeamManagementTab } from "./TeamManagementTab";
import { MyOfficeTab } from "./MyOfficeTab";
import { MySubscriptionsTab } from "./MySubscriptionsTab";
import { MyWalletTab } from "./MyWalletTab";

const BASE_TAB_CONFIG = [
  { value: "office", label: "My Office", icon: Building2 },
  { value: "subscriptions", label: "My Subscriptions", icon: Layers },
  { value: "wallet", label: "My Wallet", icon: Wallet },
  { value: "account", label: "Account Info", icon: User },
  { value: "forms-provider", label: "Forms Provider", icon: FileSignature },
  { value: "subagents", label: "Team Management", icon: Users },
] as const;

const TEMPLATES_TAB = {
  value: "templates",
  label: "Office Checklist",
  icon: ClipboardList,
} as const;

const DEFAULT_TAB = "office";

const BTQ_ADMIN_TEMPLATES_TAB_PROPS = { readOnly: true } satisfies OfficeChecklistTemplatesTabProps;

export type BrokerSettingsPageProps = {
  /** btq_admin: show Office Templates (read-only); brokers use `/office/checklist-templates` for full edit. */
  showReadOnlyTemplatesTab?: boolean;
};

/** Broker settings shell; optional read-only Templates tab for btq_admin. */
export function BrokerSettingsPage({ showReadOnlyTemplatesTab = false }: BrokerSettingsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabConfig = useMemo(
    () =>
      showReadOnlyTemplatesTab ? ([...BASE_TAB_CONFIG, TEMPLATES_TAB] as const) : BASE_TAB_CONFIG,
    [showReadOnlyTemplatesTab]
  );

  const tabValueSet = useMemo(() => new Set(tabConfig.map((t) => t.value)), [tabConfig]);

  const activeTab = useMemo(() => {
    const raw = searchParams.get("tab")?.trim() ?? "";
    return tabValueSet.has(raw) ? raw : DEFAULT_TAB;
  }, [searchParams, tabValueSet]);

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
              {tabConfig.map(({ value, label, icon: Icon }) => (
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
          <TabsContent value="forms-provider" className="mt-4">
            <FormsProviderTab />
          </TabsContent>
          <TabsContent value="subagents" className="mt-4">
            <TeamManagementTab />
          </TabsContent>
          {showReadOnlyTemplatesTab ? (
            <TabsContent value="templates" className="mt-4">
              <OfficeChecklistTemplatesTab {...BTQ_ADMIN_TEMPLATES_TAB_PROPS} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
