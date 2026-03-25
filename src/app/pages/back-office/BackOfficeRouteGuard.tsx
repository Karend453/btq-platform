import React, { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { canAccessBtqBackOffice, getUserProfileRoleKey } from "../../../services/auth";

/**
 * Route-level gate for BTQ Back Office (`/back-office/*`).
 *
 * Uses {@link canAccessBtqBackOffice}: **`admin` is only a temporary BTQ wall** (same as the
 * `list_offices_for_back_office` RPC), not the final internal role story. Sidebar visibility must
 * stay in sync with this guard.
 */
export function BackOfficeRouteGuard() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    getUserProfileRoleKey().then((key) => {
      if (cancelled) return;
      if (!canAccessBtqBackOffice(key)) {
        navigate("/", { replace: true });
        setGate("denied");
        return;
      }
      setGate("ok");
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (gate === "loading") {
    return (
      <div className="flex h-full min-h-[50vh] flex-1 items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }
  if (gate === "denied") {
    return null;
  }
  return <Outlet />;
}
