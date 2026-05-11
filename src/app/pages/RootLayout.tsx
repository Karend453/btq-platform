import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DashboardSidebar, NavSection } from "../components/dashboard/DashboardSidebar";
import { useAuth } from "../contexts/AuthContext";
import { Toaster } from "../components/ui/sonner";
import {
  canAccessBtqBackOffice,
  getUserProfileRoleKey,
  resumePendingBrokerSignup,
} from "../../services/auth";
import { getCurrentOffice } from "../../services/offices";
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Building2,
  Settings,
  ClipboardList,
  Shield,
  CreditCard,
  Briefcase,
  BookOpen,
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
        href: "/settings?tab=subagents",
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
        label: "Resource Center",
        href: "/resources",
        icon: BookOpen,
      },
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
        href: "/settings?tab=subagents",
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
        label: "Resource Center",
        href: "/resources",
        icon: BookOpen,
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

/**
 * Post-login billing gate state for broker signups that confirmed email but never finished
 * Stripe checkout. We key "unpaid new signup" on the combination of `offices.plan_tier` (set only
 * by `complete_broker_signup`) and missing `offices.stripe_subscription_id` (populated by the
 * Stripe webhook on `checkout.session.completed`). This leaves legacy offices with no `plan_tier`
 * grandfathered and any office with an active subscription untouched.
 */
type BillingGateState = "idle" | "loading" | "ok" | "unpaid";

export function RootLayout() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const [profileRoleKey, setProfileRoleKey] = useState<
    "admin" | "agent" | "broker" | "btq_admin" | null | undefined
  >(undefined);
  const [billingGateState, setBillingGateState] = useState<BillingGateState>("idle");

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfileRoleKey(undefined);
      return;
    }

    // Post-login provisioning resume. Idempotent + fail-safe: a no-op for users without a
    // pending signup or who are already provisioned. Running it before we read the profile
    // role means brokers coming back from email confirmation get their `user_profiles.role`
    // flipped from 'agent' → 'broker' and their office created BEFORE the layout decides
    // what to render, which also means the existing billing gate below catches them.
    (async () => {
      try {
        await resumePendingBrokerSignup();
      } catch (e) {
        console.warn(
          "[RootLayout] resumePendingBrokerSignup failed; continuing with current profile",
          e
        );
      }
      if (cancelled) return;
      const key = await getUserProfileRoleKey();
      if (!cancelled) setProfileRoleKey(key);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!user || profileRoleKey === undefined) {
      setBillingGateState("idle");
      return;
    }

    // Only brokers go through the post-signup checkout flow. Other roles (admin, agent,
    // btq_admin, legacy null) are never gated here.
    if (profileRoleKey !== "broker") {
      setBillingGateState("ok");
      return;
    }

    setBillingGateState("loading");
    getCurrentOffice()
      .then((office) => {
        if (cancelled) return;
        const hasSubscription = !!office?.stripe_subscription_id?.trim();
        const hasPlanTier = !!office?.plan_tier?.trim();
        // Grandfather legacy offices (no plan_tier) and anyone who has completed checkout
        // at least once (stripe_subscription_id set by webhook). Canceled subs are out of
        // scope for this gate — that's handled by `app_access_status` elsewhere.
        setBillingGateState(!hasSubscription && hasPlanTier ? "unpaid" : "ok");
      })
      .catch(() => {
        // Fail open so a transient Supabase hiccup doesn't lock brokers out of their app.
        if (!cancelled) setBillingGateState("ok");
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, profileRoleKey]);

  const navSections = useMemo(() => {
    if (profileRoleKey === "broker") return navSectionsBroker;

    if (!canAccessBtqBackOffice(profileRoleKey ?? null)) return navSectionsDefault;

    const management = navSectionsDefault[1];
    const system = navSectionsDefault[3];
    return [
      navSectionsDefault[0],
      {
        ...management,
        items: [
          ...management.items,
          {
            label: "Office Templates",
            href: "/office/checklist-templates",
            icon: ClipboardList,
          },
        ],
      },
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
          {
            label: "Business Overview",
            href: "/back-office/business-overview",
            icon: Briefcase,
          },
          {
            label: "Billing",
            href: "/back-office/billing",
            icon: CreditCard,
          },
        ],
      },
    ];
  }, [profileRoleKey]);

  const isBroker = profileRoleKey === "broker";
  const isBtqAdmin = profileRoleKey === "btq_admin";

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  const isBillingCheckoutReturn =
    location.pathname === "/settings/billing/success" ||
    location.pathname === "/settings/billing/cancelled" ||
    location.pathname === "/settings/billing/cancel";

  if (!user && isBillingCheckoutReturn) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Outlet />
      </div>
    );
  }

  if (!user) {
    const loginTarget = location.pathname.startsWith("/back-office")
      ? "/back-office/login"
      : "/login";
    return <Navigate to={loginTarget} replace />;
  }

  // Avoid rendering the wrong nav (default vs broker) before `user_profiles.role` resolves — that
  // was swapping the whole shell after the first paint and looked like the dashboard "reverting".
  if (profileRoleKey === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  // Post-login billing gate. Exempt the gate screen itself and Stripe return URLs so brokers
  // can complete checkout and land back in the app without bouncing off the gate mid-flight.
  const isBillingGateExempt =
    location.pathname === "/billing-required" ||
    location.pathname === "/settings/billing/success" ||
    location.pathname === "/settings/billing/cancelled" ||
    location.pathname === "/settings/billing/cancel";

  if (!isBillingGateExempt && billingGateState === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  if (!isBillingGateExempt && billingGateState === "unpaid") {
    return <Navigate to="/billing-required" replace />;
  }

  // Billing-required screen renders chrome-free (no sidebar) so unpaid brokers can't navigate
  // into the app via the nav before finishing checkout.
  if (location.pathname === "/billing-required") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Outlet />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <DashboardSidebar
        logo={
          <div className="flex min-w-0 items-center gap-3">
            {/* Future: optional office/product logo via <img className="h-9 w-9 shrink-0 rounded object-contain" alt="" /> */}
            <div className="min-w-0">
              <div className="text-xl font-semibold text-white">BTQ</div>
              <div className="mt-1 text-xs text-slate-400">
                {isBtqAdmin
                  ? "BTQ Back Office"
                  : isBroker
                    ? "Broker oversight"
                    : "Broker Portal"}
              </div>
            </div>
          </div>
        }
        sections={navSections}
        footer={
          <div className="text-xs text-slate-400">
            <div>© 2026 BTQ</div>
            <div className="mt-1">v1.0.0</div>
          </div>
        }
      />
      <Outlet />
      <Toaster />
    </div>
  );
}