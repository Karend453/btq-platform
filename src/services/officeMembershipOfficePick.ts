/**
 * Shared rule: pick one office from active `office_memberships` rows (broker role first, else newest).
 * Used by billing, auth scope, and office resolution — keep logic in sync.
 */
export type MembershipPickRow = {
  office_id: string;
  role: string | null;
  created_at: string;
};

export function normalizeOfficeIdKey(value: string): string {
  return value.trim().toLowerCase();
}

export function pickActiveOfficeFromMembershipRows(rows: MembershipPickRow[]): string | null {
  if (rows.length === 0) return null;
  const broker = rows.find((r) => (r.role ?? "").trim().toLowerCase() === "broker");
  if (broker) return broker.office_id;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0]?.office_id ?? null;
}
