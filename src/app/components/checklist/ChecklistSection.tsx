import React from "react";
import { ChecklistItem } from "./ChecklistItem";

type ChecklistSectionProps = {
  title: string;
  items: {
    id: string;
    name: string;
    requirement: string | null;
    sortOrder: number;
    status?: "pending" | "complete";
  }[];
};

export function ChecklistSection({
  title,
  items,
}: ChecklistSectionProps) {
  return (
    <section className="rounded-xl border bg-white">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="divide-y">
        {items.map((item) => (
          <ChecklistItem
            key={item.id}
            name={item.name}
            requirement={item.requirement}
            status={item.status ?? "pending"}
          />
        ))}
      </div>
    </section>
  );
}