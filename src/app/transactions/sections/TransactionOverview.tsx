import { Button } from "../../components/ui/button";
import type { TransactionRow } from "../../../services/transactions";

type TransactionOverviewSectionProps = {
  row: TransactionRow & {
    intake_email?: string | null;
    client_name?: string | null;
    client?: string | null;
    office_name?: string | null;
  };
  title: string;
  officeValue: string;
  /** Agent of record for this deal (list/buyer); shown for admin review context. */
  agentDisplayName?: string | null;
  formatCurrency: (value?: number | string | null) => string;
  onSave: () => void;
  onLaunchZipForms: () => void;
  onEdit: () => void;
};

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

export default function TransactionOverviewSection({
  row,
  title,
  officeValue,
  agentDisplayName,
  formatCurrency,
  onSave,
  onLaunchZipForms,
  onEdit,
}: TransactionOverviewSectionProps) {
  return (
    <>
      {/* SNAPSHOT CARD START */}
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
            <Button variant="outline" onClick={onSave}>
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
                {(agentDisplayName ?? "").trim() ? (
                  <div style={{ marginTop: 8, fontSize: 14, color: "#334155", fontWeight: 600 }}>
                    Agent: {agentDisplayName}
                  </div>
                ) : null}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    color: "#64748b",
                  }}
                >
                  Summary — edit details to complete reporting & financial data
                </div>
              </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={onLaunchZipForms}>Launch ZipForms</Button>

            <Button variant="outline" onClick={onEdit}>
              Edit Transaction Details
            </Button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 12px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600, color: "#64748b" }}>Intake Email:</span>
          {row.intake_email ? (
            <span
              style={{
                color: "#2563eb",
                fontWeight: 600,
                wordBreak: "break-all",
              }}
            >
              {row.intake_email}
            </span>
          ) : (
            <span style={{ color: "#94a3b8" }}>—</span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SummaryField label="Client" value={row.clientname || "—"} />
          <SummaryField label="Type" value={row.type || "—"} />
          <SummaryField label="Checklist Type" value={row.checklisttype || "—"} />
          <SummaryField label="Office" value={officeValue} />
          <SummaryField label="Side of Transaction" value={row.transaction_side || "—"} />
          <SummaryField label="Transaction Category" value={row.transaction_category || "—"} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <SummaryField label="Sale Price" value={formatCurrency(row.saleprice)} />
        </div>
      </div>
      {/* SNAPSHOT CARD END */}
    </>
  );
}