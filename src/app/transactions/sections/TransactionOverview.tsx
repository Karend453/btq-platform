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
  clientValue: string;
  officeValue: string;
  formatDate: (value?: string | null) => string;
  formatCurrency: (value?: number | string | null) => string;
  onSave: () => void;
  onLaunchZipForms: () => void;
  onEdit: () => void;
  onCopyIntakeEmail: (text?: string | null) => void;
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
  clientValue,
  officeValue,
  formatDate,
  formatCurrency,
  onSave,
  onLaunchZipForms,
  onEdit,
  onCopyIntakeEmail,
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
            <Button onClick={onLaunchZipForms}>Launch ZipForms</Button>

            {row.intake_email && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopyIntakeEmail(row.intake_email)}
              >
                Copy
              </Button>
            )}

            <Button variant="outline" onClick={onEdit}>
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
          <SummaryField label="BTQ Intake Email" value={row.intake_email || "—"} fullWidth />
        </div>
      </div>
      {/* SNAPSHOT CARD END */}

      {/* TRANSACTION HEALTH CARD START */}
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 20,
          background: "#ffffff",
          padding: 24,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          marginTop: 20,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#0f172a",
            marginBottom: 6,
          }}
        >
          Transaction Health
        </div>

        <div
          style={{
            fontSize: 14,
            color: "#64748b",
            marginBottom: 20,
          }}
        >
          Quick operational snapshot of checklist progress and recent activity
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <SummaryField label="Checklist" value={row.checklisttype || "—"} />
          <SummaryField label="Missing Items" value="—" />
          <SummaryField label="Rejected Items" value="—" />
          <SummaryField label="Last Activity" value="—" />
        </div>
      </div>
      {/* TRANSACTION HEALTH CARD END */}
    </>
  );
}