import React from "react";
import { OfficeChecklistTemplatesTab } from "./settings/OfficeChecklistTemplatesTab";

/** Standalone broker page; same content as former Settings tab. */
export function OfficeChecklistTemplatesPage() {
  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <OfficeChecklistTemplatesTab />
      </div>
    </div>
  );
}
