import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { LucideIcon } from "lucide-react";

interface DataCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  children?: ReactNode;
  className?: string;
}

export function DataCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  children,
  className,
}: DataCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        )}
        {trend && (
          <p
            className={`text-xs mt-1 ${
              trend.isPositive ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {trend.isPositive ? "↑" : "↓"} {trend.value}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
