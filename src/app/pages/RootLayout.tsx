import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { DashboardSidebar, NavSection } from "../components/dashboard/DashboardSidebar";
import { useAuth } from "../contexts/AuthContext";
import { Toaster } from "../components/ui/sonner";
import { canAccessBtqBackOffice, getUserProfileRoleKey } from "../../services/auth";
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Building2,
  Settings,
  ClipboardList,
  Shield,
} from "lucide-react";

/** Default (admin / agent): full management + insights. */
const navSectionsDefault: NavSection[] = [
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

/** Broker: oversight-focused nav (no placeholder management pages; no mock transaction badge). */
const navSectionsBroker: NavSection[] = [
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
    title: "Oversight",
    items: [
      {
        label: "Agents",
        href: "/settings",
        icon: Users,
      },
      {
        label: "Transactions",
        href: "/transactions",
        icon: FileText,
      },
      {
        label: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
      {
        label: "Office Templates",
        href: "/office/checklist-templates",
        icon: ClipboardList,
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
  const [profileRoleKey, setProfileRoleKey] = useState<
    "admin" | "agent" | "broker" | null | undefined
  >(undefined);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    let cancelled = false;
    getUserProfileRoleKey().then((key) => {
      if (!cancelled) setProfileRoleKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const navSections = useMemo(() => {
    if (profileRoleKey === "broker") return navSectionsBroker;
    // Back Office link only when `canAccessBtqBackOffice` — temporary `admin` BTQ wall; see auth.ts.
    if (!canAccessBtqBackOffice(profileRoleKey ?? null)) return navSectionsDefault;

    const system = navSectionsDefault[3];
    return [
      navSectionsDefault[0],
      navSectionsDefault[1],
      navSectionsDefault[2],
      {
        ...system,
        items: [
          ...system.items,
          {
            label: "Back Office",
            href: "/back-office/org",
            icon: Shield,
          },
        ],
      },
    ];
  }, [profileRoleKey]);

  const isBroker = profileRoleKey === "broker";

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
            <div className="text-xs text-slate-400 mt-1">
              {isBroker ? "Broker oversight" : "Broker Portal"}
            </div>
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