import { useEffect, useMemo, useState } from "react";
import React from "react";
import { Button } from "../components/ui/button";
import { getTransaction, type TransactionRow } from "../../services/transactions";
import TransactionOverview from "./sections/TransactionOverview";
import TransactionInbox from "./sections/TransactionInbox";
import TransactionControls from "./sections/TransactionControls";
import GeneratedIntakeEmail from "./sections/GeneratedIntakeEmail";
import TransactionActivity from "./sections/TransactionActivity";
import type { ChecklistItem, InboxDocument } from "./sections/TransactionInbox";
import type { ArchiveMetadata, TransactionStatus } from "./sections/TransactionControls";
import type { ActivityLogEntry, ActivityFilter } from "./sections/TransactionActivity";

function handleSave() {
  window.location.href = "/transactions";
}

function handleLaunchZipForms() {
  alert("ZipForms launch coming soon");
}

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

export default function TransactionDetailsPage() {
  const id = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [inboxDocuments, setInboxDocuments] = useState<InboxDocument[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>("Pre-Contract");
  const [assignedAdmin, setAssignedAdmin] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [contractDate, setContractDate] = useState<string | null>(null);
  const [archiveMetadata, setArchiveMetadata] = useState<ArchiveMetadata | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  function handleEdit() {
    window.location.href = `/transactions/${id}/edit`;
  }

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
          if (data) {
            const s = data.status as string;
            const valid: TransactionStatus[] = ["Pre-Contract", "Under Contract", "Closed", "Archived"];
            setTransactionStatus(valid.includes(s as TransactionStatus) ? (s as TransactionStatus) : "Pre-Contract");
            setAssignedAdmin(data.assignedadmin ?? null);
            setClosingDate(data.closingdate ?? null);
            setContractDate(data.contractdate ?? null);
          }
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

  const isReadOnly = transactionStatus === "Archived";

  function handleStatusChange(status: TransactionStatus) {
    setTransactionStatus(status);
  }

  function handleAssignedAdminChange(admin: string) {
    setAssignedAdmin(admin);
  }

  function handleClosingDateChange(date: string) {
    setClosingDate(date);
  }

  function handleContractDateChange(date: string) {
    setContractDate(date);
  }

  function handleOpenArchiveModal() {
    if (transactionStatus !== "Closed") return;
    const confirmed = window.confirm(
      "Archive this transaction? It will become read-only. Download the Archive Package for your records."
    );
    if (!confirmed) return;
    const txn = transaction as TransactionRow & { identifier?: string; office?: string; agent?: string };
    setArchiveMetadata({
      archivedAt: new Date(),
      archivedBy: { name: "Current User", role: "Admin" },
      archiveReceipt: {
        transactionSummary: {
          identifier: txn?.identifier ?? "Unknown",
          id: id ?? "Unknown",
          office: txn?.office ?? "Unknown Office",
          assignedAgent: txn?.agent ?? "—",
          status: "Closed",
        },
        documentSummary: {
          requiredComplete: checklistItems.filter((i) => i.requirement === "required" && i.reviewStatus === "complete").length,
          requiredWaived: checklistItems.filter((i) => i.requirement === "required" && i.reviewStatus === "waived").length,
          optionalComplete: checklistItems.filter((i) => i.requirement === "optional" && i.reviewStatus === "complete").length,
          totalDocuments: checklistItems.length,
        },
        activityLogCount: 0,
      },
      archivedActivityLog: [],
    });
    setTransactionStatus("Archived");
  }

  function handleDownloadArchivePackage() {
    const pkg = {
      transaction: { id, status: transactionStatus, closingDate, contractDate, assignedAdmin },
      archivedMetadata: archiveMetadata,
      archivedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-${id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 32 }}>
        <TransactionOverview
          row={row}
          title={title}
          clientValue={clientValue}
          officeValue={officeValue}
          formatDate={formatDate}
          formatCurrency={formatCurrency}
          onSave={handleSave}
          onLaunchZipForms={handleLaunchZipForms}
          onEdit={handleEdit}
          onCopyIntakeEmail={handleCopy}
        />

        <TransactionControls
          transactionStatus={transactionStatus}
          assignedAdmin={assignedAdmin}
          closingDate={closingDate}
          contractDate={contractDate}
          checklistItems={checklistItems}
          isReadOnly={isReadOnly}
          currentUserRole="Admin"
          archiveMetadata={archiveMetadata}
          onStatusChange={handleStatusChange}
          onAssignedAdminChange={handleAssignedAdminChange}
          onClosingDateChange={handleClosingDateChange}
          onContractDateChange={handleContractDateChange}
          onOpenArchiveModal={handleOpenArchiveModal}
          onDownloadArchivePackage={handleDownloadArchivePackage}
          onViewArchivedActivityLog={() => {}}
        />

        <GeneratedIntakeEmail intakeEmail={row.intake_email} />

        <TransactionInbox
          transactionId={id}
          inboxDocuments={inboxDocuments}
          onInboxDocumentsChange={setInboxDocuments}
          checklistItems={checklistItems}
          onChecklistItemsChange={setChecklistItems}
        />



        <TransactionActivity
          activityEntries={activityLog}
          currentActivityFilter={activityFilter}
          onActivityFilterChange={setActivityFilter}
        />

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            background: "#ffffff",
            padding: 24,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            marginTop: 16,
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
          </div>
        </div>
      </div>
    </div>
  );
  }