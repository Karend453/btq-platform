import { Activity as ActivityIcon, ExternalLink, FileText, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  actor: "System" | "Agent" | "Admin";
  category: "docs" | "forms" | "system" | "transaction";
  type: string;
  message: string;
  meta?: {
    docName?: string;
    fromStatus?: string;
    toStatus?: string;
    [key: string]: unknown;
  };
}

export type ActivityFilter = "all" | "docs" | "forms" | "system" | "transaction";

export type TransactionActivityProps = {
  activityEntries: ActivityLogEntry[];
  currentActivityFilter: ActivityFilter;
  onActivityFilterChange: (filter: ActivityFilter) => void;
};

function formatActivityTimestamp(date: Date) {
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getActivityIcon(category: string) {
  switch (category) {
    case "docs":
      return <FileText className="h-4 w-4" />;
    case "forms":
      return <ExternalLink className="h-4 w-4" />;
    case "system":
      return <ActivityIcon className="h-4 w-4" />;
    case "transaction":
      return <ActivityIcon className="h-4 w-4" />;
    default:
      return <ActivityIcon className="h-4 w-4" />;
  }
}

function getActivityColor(category: string) {
  switch (category) {
    case "docs":
      return "bg-blue-100 text-blue-700";
    case "forms":
      return "bg-purple-100 text-purple-700";
    case "transaction":
      return "bg-emerald-100 text-emerald-700";
    case "system":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function TransactionActivity({
  activityEntries,
  currentActivityFilter,
  onActivityFilterChange,
}: TransactionActivityProps) {
  const filteredActivities =
    currentActivityFilter === "all"
      ? activityEntries
      : activityEntries.filter((a) => a.category === currentActivityFilter);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ActivityIcon className="h-5 w-5" />
            Activity
          </CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <div className="flex gap-2">
              <button
                onClick={() => onActivityFilterChange("all")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  currentActivityFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => onActivityFilterChange("docs")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  currentActivityFilter === "docs"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                Docs
              </button>
              <button
                onClick={() => onActivityFilterChange("forms")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  currentActivityFilter === "forms"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                }`}
              >
                Forms
              </button>
              <button
                onClick={() => onActivityFilterChange("system")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  currentActivityFilter === "system"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                System
              </button>
              <button
                onClick={() => onActivityFilterChange("transaction")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  currentActivityFilter === "transaction"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                }`}
              >
                Transaction
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No activity to display
            </div>
          ) : (
            filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-lg ${getActivityColor(
                    activity.category
                  )} flex items-center justify-center`}
                >
                  {getActivityIcon(activity.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {activity.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                        <span className="font-medium">{activity.actor}</span>
                        <span className="text-slate-400">•</span>
                        <span>
                          {formatActivityTimestamp(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
