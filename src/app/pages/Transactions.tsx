import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { TransactionsList } from "../transactions/_transactions";

const offices = [
  { id: "all", name: "All Offices" },
  { id: "downtown", name: "Downtown Office" },
  { id: "northside", name: "Northside Office" },
  { id: "westend", name: "West End Office" },
];

export function Transactions() {
  const [searchParams] = useSearchParams();
  const [selectedOffice, setSelectedOffice] = useState("all");
  const [initialFilter, setInitialFilter] = useState<string | null>(null);
  const userRole = "broker"; // In a real app, this would come from auth context

  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam) {
      setInitialFilter(filterParam);
    }
  }, [searchParams]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <DashboardHeader
        offices={offices}
        selectedOffice={selectedOffice}
        onOfficeChange={setSelectedOffice}
        userName="John Anderson"
        notificationCount={3}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <TransactionsList userRole={userRole} initialFilter={initialFilter} />
        </div>
      </main>
    </div>
  );
}