import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { ExternalLink } from "lucide-react";

interface SSOTileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  onClick: () => void;
}

export function SSOTile({
  title,
  description,
  icon: Icon,
  iconColor,
  onClick,
}: SSOTileProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group" onClick={onClick}>
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
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
