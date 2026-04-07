import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { signOut } from "../../../services/auth";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Avatar, AvatarFallback } from "../ui/avatar";

export type DashboardOfficeOption = { id: string; label: string };

interface DashboardHeaderProps {
  /** Offices the user may view on the dashboard (one or many). */
  officeOptions?: DashboardOfficeOption[];
  /** Selected office id; null when no offices or not yet resolved. */
  selectedOfficeId?: string | null;
  onOfficeChange: (officeId: string) => void;
  officeLoading?: boolean;
  profileTo: string;
  settingsTo: string;
  userName?: string;
  userEmail?: string;
}

export function DashboardHeader({
  officeOptions = [],
  selectedOfficeId = null,
  onOfficeChange,
  officeLoading = false,
  profileTo,
  settingsTo,
  userName = "Admin User",
  userEmail,
}: DashboardHeaderProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm text-slate-600">Office:</span>
          {officeLoading ? (
            <span className="text-sm text-slate-500">Loading…</span>
          ) : officeOptions.length === 0 ? (
            <span className="text-sm text-slate-500">No office available</span>
          ) : (
            <Select
              value={selectedOfficeId ?? officeOptions[0]?.id ?? ""}
              onValueChange={onOfficeChange}
            >
              <SelectTrigger
                className="h-9 w-[min(100vw-12rem,22rem)] max-w-full border-slate-200 bg-white text-left font-medium text-slate-900 shadow-sm"
                aria-label="Dashboard office context"
              >
                <SelectValue placeholder="Select office" />
              </SelectTrigger>
              <SelectContent>
                {officeOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-slate-200 text-slate-700">
                    {userName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <span className="text-sm block">{userName}</span>
                  {userEmail && (
                    <span className="text-xs text-slate-500 block">{userEmail}</span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(profileTo)}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(settingsTo)}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
