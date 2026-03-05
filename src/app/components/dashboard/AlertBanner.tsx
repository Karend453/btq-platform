import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

export type AlertType = "success" | "warning" | "error" | "info";

interface AlertBannerProps {
  type: AlertType;
  title?: string;
  message: string;
  className?: string;
}

export function AlertBanner({
  type,
  title,
  message,
  className,
}: AlertBannerProps) {
  const alertConfig = {
    success: {
      icon: CheckCircle,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
    warning: {
      icon: AlertCircle,
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    error: {
      icon: XCircle,
      className: "border-red-200 bg-red-50 text-red-900",
    },
    info: {
      icon: Info,
      className: "border-blue-200 bg-blue-50 text-blue-900",
    },
  };

  const { icon: Icon, className: typeClassName } = alertConfig[type];

  return (
    <Alert className={`${typeClassName} ${className || ""}`}>
      <Icon className="h-4 w-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
