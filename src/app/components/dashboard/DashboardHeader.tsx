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
import { Avatar, AvatarFallback } from "../ui/avatar";

interface DashboardHeaderProps {
  /** Signed-in user's office from `user_profiles.office_id` / `offices`; null if none linked. */
  office: { id: string; label: string } | null;
  officeLoading?: boolean;
  profileTo: string;
  settingsTo: string;
  userName?: string;
  userEmail?: string;
}

export function DashboardHeader({
  office,
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
        {/* Left: Office Selector */}
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm text-slate-600">Office:</span>
            {officeLoading ? (
              <span className="text-sm text-slate-500">Loading…</span>
            ) : office ? (
              <span
                className="max-w-[min(100vw-12rem,28rem)] truncate text-sm font-medium text-slate-900"
                title={office.label}
              >
                {office.label}
              </span>
            ) : (
              <span className="text-sm text-slate-500">No office on your profile</span>
            )}
          </div>
        </div>

        {/* Right: User Menu */}
        <div className="flex items-center gap-3">
          {/* User Menu / Who am I */}
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
