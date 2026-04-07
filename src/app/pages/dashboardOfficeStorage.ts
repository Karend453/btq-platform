/** Dashboard-only persistence for the office viewing context (localStorage). */

const PREFIX = "btq_dashboard_office_v1:";

export function readDashboardOfficeSelection(userId: string): string | null {
  if (!userId.trim()) return null;
  try {
    const v = localStorage.getItem(PREFIX + userId);
    if (v == null || v === "") return null;
    const t = v.trim();
    return t === "" ? null : t;
  } catch {
    return null;
  }
}

export function writeDashboardOfficeSelection(userId: string, officeId: string | null): void {
  if (!userId.trim()) return;
  try {
    const key = PREFIX + userId;
    if (officeId == null || officeId.trim() === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, officeId.trim());
    }
  } catch {
    /* ignore quota / private mode */
  }
}
