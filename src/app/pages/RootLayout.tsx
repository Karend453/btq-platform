import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { DashboardSidebar, NavSection } from "../components/dashboard/DashboardSidebar";
import { useAuth } from "../contexts/AuthContext";
import { Toaster } from "../components/ui/sonner";
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Building2,
  Settings,
} from "lucide-react";

const navSections: NavSection[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Agents",
        href: "/agents",
        icon: Users,
      },
      {
        label: "Transactions",
        href: "/transactions",
        icon: FileText,
        badge: 8,
      },
      {
        label: "Offices",
        href: "/offices",
        icon: Building2,
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        label: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

export function RootLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <DashboardSidebar
        logo={
          <div>
            <div className="text-xl font-semibold text-white">RealtyPro</div>
            <div className="text-xs text-slate-400 mt-1">Broker Portal</div>
          </div>
        }
        sections={navSections}
        footer={
          <div className="text-xs text-slate-400">
            <div>© 2026 RealtyPro</div>
            <div className="mt-1">v1.0.0</div>
          </div>
        }
      />
      <Outlet />
      <Toaster />
    </div>
  );
}