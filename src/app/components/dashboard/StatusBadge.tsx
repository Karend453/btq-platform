import { Badge } from "../ui/badge";

export type StatusType = "success" | "warning" | "error" | "info" | "pending";

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const statusStyles = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <Badge 
      variant="outline" 
      className={`${statusStyles[status]} ${className || ""}`}
    >
      {label}
    </Badge>
  );
}
