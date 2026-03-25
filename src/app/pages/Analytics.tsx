import React from "react";
import { BarChart3 } from "lucide-react";

export function Analytics() {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="h-8 w-8 text-slate-600" />
          <h1 className="text-3xl font-semibold text-slate-900">Analytics</h1>
        </div>
        <p className="text-slate-600">Analytics page coming soon...</p>
      </div>
    </div>
  );
}
