import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { listOfficesForBackOffice, type BackOfficeListOfficeRow } from "../../../services/offices";

function formatAddress(o: BackOfficeListOfficeRow): string {
  const parts = [
    o.address_line1?.trim(),
    [o.city?.trim(), o.state?.trim()].filter(Boolean).join(", "),
    o.postal_code?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function OrgManagementPage() {
  const [offices, setOffices] = useState<BackOfficeListOfficeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOfficesForBackOffice().then(({ offices: rows, error: err }) => {
      if (cancelled) return;
      setOffices(rows);
      setError(err);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-slate-600" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Org management</h1>
              <p className="text-sm text-slate-500">Back Office · Offices</p>
            </div>
          </div>
          <Link
            to="/back-office/org/new"
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Office
          </Link>
        </div>

        {loading && <p className="text-slate-600">Loading offices…</p>}
        {!loading && error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {!loading && !error && offices.length === 0 && (
          <p className="text-slate-600">No offices found.</p>
        )}

        {!loading && !error && offices.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Office name</th>
                  <th className="px-4 py-3">Record ID</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Primary contact</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">MLS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offices.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/back-office/org/${o.id}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {o.display_name?.trim() || o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.id}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-700">{formatAddress(o)}</td>
                    <td className="px-4 py-3 text-slate-700">{o.broker_name?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{o.broker_email?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{o.state?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{o.mls_name?.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
