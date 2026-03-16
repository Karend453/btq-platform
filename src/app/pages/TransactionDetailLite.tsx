import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { getTransaction, type TransactionRow } from "../../services/transactions";


function formatCurrency(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue =
    typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));

  if (Number.isNaN(numericValue)) return String(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getImportantDate(transaction: TransactionRow): ImportantDateResult {
  if (transaction.closingdate) {
    return { label: "Closing", value: transaction.closingdate };
  }

  if (transaction.contractdate) {
    return { label: "Contract", value: transaction.contractdate };
  }

  return { label: "Important Date", value: null };
}

function SummaryField({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value?: string | number | null;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 16,
        background: "#f8fafc",
        gridColumn: fullWidth ? "span 2" : "span 1",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function TransactionDetailLite() {
  const id = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (!id) {
          if (!cancelled) setTransaction(null);
          return;
        }

        const data = await getTransaction(id);

        if (!cancelled) {
          setTransaction(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy(text?: string | null) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard");
    } catch {
      alert("Copy failed");
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!transaction) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Button variant="outline" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
        <div>Not found.</div>
      </div>
    );
  }

  const row = transaction as TransactionRow & {
    identifier?: string | null;
    address?: string | null;
    address_identifier?: string | null;
    client?: string | null;
    client_name?: string | null;
    checklist_type?: string | null;
    office?: string | null;
    office_name?: string | null;
    assigned_admin?: string | null;
    intake_email?: string | null;
    sale_price?: number | string | null;
    status?: string | null;
    type?: string | null;
  };

  const title =
    row.address_identifier ||
    row.address ||
    row.identifier ||
    `Transaction ${row.id}`;

  const clientValue = row.client_name || row.client || "—";
  const officeValue = row.office_name || row.office || "—";

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            background: "#ffffff",
            padding: 24,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "grid", gap: 12 }}>
            <Button variant="outline" onClick={() => (window.location.href = "/transactions")}>
  Save
</Button>

              <div>
                <h1
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: 0,
                  }}
                >
                  {title}
                </h1>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    color: "#64748b",
                  }}
                >
                  Transaction snapshot
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => alert("ZipForms launch coming soon")}>
                Launch ZipForms
              </Button>

              {row.intake_email ? (
                <Button variant="outline" onClick={() => handleCopy(row.intake_email)}>
                  Copy Intake Email
                </Button>
              ) : null}

              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `/transactions/${id}/edit`;
                }}
              >
                Edit Transaction Details
              </Button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <SummaryField label="Client" value={clientValue} />
            <SummaryField label="Type" value={row.type || "—"} />
            <SummaryField label="Checklist Type" value={row.checklisttype || "—"} />
            <SummaryField label="Office" value={officeValue} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <SummaryField label="Status" value={row.status || "—"} />
<SummaryField label="Assigned Admin" value={row.assignedadmin || "—"} />
<SummaryField
  label="Closing Date"
  value={row.closingdate ? formatDate(row.closingdate) : "—"}
/>
<SummaryField label="Sale Price" value={formatCurrency(row.saleprice)} />
<div
  style={{
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 16,
    background: "#f8fafc",
    gridColumn: "span 2",
  }}
>
  <div
    style={{
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "#64748b",
      marginBottom: 6,
    }}
  >
    BTQ Intake Email
  </div>

  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <div style={{ fontSize: 15, fontWeight: 600 }}>
      {row.intake_email || "—"}
    </div>

    {row.intake_email && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleCopy(row.intake_email)}
      >
        Copy
      </Button>
    )}
  </div>
</div>
          </div>
        </div>
      </div>
    </div>
  );
}