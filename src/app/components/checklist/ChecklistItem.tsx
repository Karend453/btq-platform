import React from "react";

type ChecklistItemProps = {
  name: string;
  requirement: string | null;
  status: "pending" | "complete";
};

export function ChecklistItem({
  name,
  requirement,
  status,
}: ChecklistItemProps) {
  const isRequired = requirement?.toLowerCase() === "required";

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">
          {isRequired ? "Required" : "Optional"}
        </p>
      </div>

      <div className="shrink-0">
        <span className="rounded-full border px-2 py-1 text-xs text-slate-600">
          {status}
        </span>
      </div>
    </div>
  );
}