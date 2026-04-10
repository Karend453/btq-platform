import React, { useEffect, useState } from "react";
import { getUserProfileRoleKey } from "../../services/auth";
import { OfficeChecklistTemplatesTab } from "./settings/OfficeChecklistTemplatesTab";

/**
 * Standalone page: brokers edit templates; btq_admin is read-only and uses the same active office
 * session as the dashboard (`useOfficeForSettingsTabs` / `getCurrentOffice`).
 */
export function OfficeChecklistTemplatesPage() {
  const [readOnly, setReadOnly] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getUserProfileRoleKey().then((key) => {
      if (!cancelled) setReadOnly(key === "btq_admin");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (readOnly === undefined) {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-slate-600 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <OfficeChecklistTemplatesTab readOnly={readOnly} />
      </div>
    </div>
  );
}
