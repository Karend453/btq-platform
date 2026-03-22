import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { getOfficeRosterForCurrentBroker, type OfficeRosterRow } from "../../../services/officeRoster";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

function roleLabelForDisplay(raw: string | null | undefined): string {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  return "—";
}

function displayNameForRow(row: OfficeRosterRow): string {
  const name = row.display_name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return "—";
}

/**
 * Broker-facing read-only roster for the current office (`user_profiles.office_id`).
 */
export function ManageSubagentsTab() {
  const [rows, setRows] = useState<OfficeRosterRow[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getOfficeRosterForCurrentBroker().then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = rows === undefined;
  const list = rows ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Manage Subagents</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-600">Loading roster…</p>
          ) : list.length === 0 ? (
            <p className="text-slate-600 leading-relaxed">
              No one is listed for your office yet, or your account isn&apos;t linked to an office. If
              you expected to see your team, confirm your office assignment with your administrator.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2.5 text-slate-900 align-top">{displayNameForRow(row)}</td>
                      <td className="px-3 py-2.5 text-slate-900 align-top break-words">
                        {row.email?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-900 align-top whitespace-nowrap">
                        {roleLabelForDisplay(row.role)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
