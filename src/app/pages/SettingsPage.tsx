import { Settings } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="h-8 w-8 text-slate-600" />
          <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
        </div>
        <p className="text-slate-600">Settings page coming soon...</p>
      </div>
    </div>
  );
}
