import React from "react";
import { groupChecklistItemsBySection } from "../../../lib/utils/groupChecklistItemsBySection";
import { ChecklistSection } from "./ChecklistSection";

type ChecklistPanelProps = {
  items: any[];
  isLoading?: boolean;
};

export function ChecklistPanel({
  items,
  isLoading = false,
}: ChecklistPanelProps) {
  if (isLoading) {
    return <div className="text-sm text-slate-500">Loading checklist...</div>;
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
        No checklist items found for this template.
      </div>
    );
  }

  const groupedSections = groupChecklistItemsBySection(items);

  return (
    <div className="space-y-6">
      {groupedSections.map((section) => (
        <ChecklistSection
          key={section.sectionId}
          title={section.sectionTitle}
          items={section.items}
        />
      ))}
    </div>
  );
}