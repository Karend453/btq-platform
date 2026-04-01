import React from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ExternalLink } from "lucide-react";

interface SSOTileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  onClick?: () => void;
}

export function SSOTile({
  title,
  description,
  icon: Icon,
  iconColor,
  onClick,
}: SSOTileProps) {
  const interactive = typeof onClick === "function";

  return (
    <Card
      className={
        interactive
          ? "cursor-pointer transition-shadow hover:shadow-md hover:border-gray-300 group"
          : "cursor-default"
      }
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-lg ${iconColor}`}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
              <p className="text-sm text-slate-600">{description}</p>
            </div>
          </div>
          {interactive ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          ) : (
            <div className="size-10 shrink-0" aria-hidden />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
