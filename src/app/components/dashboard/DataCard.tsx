import React, { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";
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
    <Card
      className={cn(
        "gap-0 border-slate-200/70 bg-slate-50/60 shadow-none",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 pt-2.5 pb-1">
        <CardTitle className="text-xs font-medium text-slate-500">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
      </CardHeader>
      <CardContent className="px-3 pb-2.5 pt-0">
        <div className="text-xl font-medium text-slate-800">{value}</div>
        {subtitle && (
          <p className="text-[11px] leading-snug text-slate-500 mt-0.5">{subtitle}</p>
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
