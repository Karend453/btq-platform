import { useEffect, useState } from "react";
import { getOfficeForSettingsTabs, type Office } from "../../../services/offices";
import { ACTIVE_OFFICE_CHANGED_EVENT } from "../dashboardOfficeStorage";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Office row for Settings tabs that follow {@link getCurrentOffice} (membership-primary, plus btq_admin
 * active office session). Passes through legacy `profile?.office_id` for last-resort loading only
 * (see {@link getOfficeForSettingsTabs}).
 * Subscribes to {@link writeDashboardOfficeSelection} via a window event so tabs update after
 * dashboard office changes without a full reload.
 */
export function useOfficeForSettingsTabs(profileOfficeId: string | null | undefined): {
  office: Office | null | undefined;
} {
  const { user } = useAuth();
  const [office, setOffice] = useState<Office | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getOfficeForSettingsTabs(profileOfficeId).then((o) => {
        if (!cancelled) setOffice(o);
      });
    };
    load();
    const handler = () => load();
    window.addEventListener(ACTIVE_OFFICE_CHANGED_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_OFFICE_CHANGED_EVENT, handler);
    };
  }, [profileOfficeId, user?.id]);

  return { office };
}
