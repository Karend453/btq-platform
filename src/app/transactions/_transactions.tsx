import { useEffect, useMemo, useState } from "react";
import { useTerminology } from "../../hooks/useTerminology";
import { useNavigate } from "react-router-dom";
import { Search, Plus, AlertCircle, FileX, Archive } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { StatusBadge, StatusType } from "../components/dashboard/StatusBadge";

// ✅ Service layer (Supabase now, AWS later)
import { listTransactions } from "../../services/transactions";
import type { WorkItem } from "../../types/workItem";

type StatusFilter = "all" | StatusType;
type SortBy = "closingDate" | "agentName" | "address";

/** Strip leading street number so address sort orders by street name, not house number. */
function addressSortKey(identifier: string): string {
  const t = identifier.trim();
  const rest = t.replace(/^\d+[A-Za-z]?(?:\s*[-/]\s*\d+)?\s+/, "").trimStart();
  return rest || t;
}

export default function TransactionsPage() {
  const { terms } = useTerminology();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkItem[]>([]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("closingDate");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await listTransactions();
if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows
      .filter((r) => (showArchived ? true : !r.isArchived))
      .filter((r) => (statusFilter === "all" ? true : (r.status as StatusType) === statusFilter))
      .filter((r) => {
        if (!q) return true;

        return (
          r.id.toLowerCase().includes(q) ||
          r.identifier.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.owner ?? "").toLowerCase().includes(q) ||
          (r.agentDisplayName ?? "").toLowerCase().includes(q) ||
          (r.organizationName ?? "").toLowerCase().includes(q) ||
          r.statusLabel.toLowerCase().includes(q)
        );
      });
  }, [rows, query, statusFilter, showArchived]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    const parseClosing = (w: WorkItem) => {
      const n = Date.parse(w.dueDate || "");
      return Number.isNaN(n) ? null : n;
    };
    copy.sort((a, b) => {
      if (sortBy === "closingDate") {
        const da = parseClosing(a);
        const db = parseClosing(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      }
      if (sortBy === "agentName") {
        return (a.agentDisplayName ?? "").localeCompare(b.agentDisplayName ?? "", undefined, {
          sensitivity: "base",
        });
      }
      return addressSortKey(a.identifier).localeCompare(addressSortKey(b.identifier), undefined, {
        sensitivity: "base",
      });
    });
    return copy;
  }, [filteredRows, sortBy]);

  const summary = useMemo(() => {
    const needsAttention = filteredRows.filter(
      (r) => (r.missingCount ?? 0) > 0 || (r.rejectedCount ?? 0) > 0
    ).length;

    const totalMissing = filteredRows.reduce((sum, r) => sum + (r.missingCount ?? 0), 0);
    const totalRejected = filteredRows.reduce((sum, r) => sum + (r.rejectedCount ?? 0), 0);

    return { needsAttention, totalMissing, totalRejected };
  }, [filteredRows]);

  const openTransaction = (id: string) => {
    navigate(`/transactions/${id}`);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>
  {terms ? terms.record_label_plural : "Transactions"}
</h2>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Badge variant="secondary">{filteredRows.length} showing</Badge>

            <Badge variant="secondary">
              <AlertCircle style={{ width: 14, height: 14, marginRight: 6 }} />
              {summary.needsAttention} need attention
            </Badge>

            <Badge variant="secondary">
              <FileX style={{ width: 14, height: 14, marginRight: 6 }} />
              {summary.totalMissing} pending review
            </Badge>

            <Badge variant="secondary">
              <FileX style={{ width: 14, height: 14, marginRight: 6 }} />
              {summary.totalRejected} rejected
            </Badge>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
            <Archive style={{ width: 16, height: 16, marginRight: 8 }} />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>

         <Button onClick={() => navigate("/transactions/new")} variant="default">
            <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
            New
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", minWidth: 280, flex: "1 1 280px" }}>
          <Search
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              width: 18,
              height: 18,
              opacity: 0.7,
            }}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, identifier, owner, organization…"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div style={{ width: 220 }}>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {/* These values must match your StatusType union */}
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div style={{ width: 240 }}>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="closingDate">Closing date (soonest first)</SelectItem>
              <SelectItem value="agentName">Agent name</SelectItem>
              <SelectItem value="address">Address</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Card>
            <CardContent style={{ padding: 18 }}>Loading transactions…</CardContent>
          </Card>
        ) : sortedRows.length === 0 ? (
          <Card>
            <CardContent style={{ padding: 18 }}>No transactions match your filters.</CardContent>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedRows.map((t) => {
              const needsAttention = (t.missingCount ?? 0) > 0 || (t.rejectedCount ?? 0) > 0;
              const isClosed =
                (t.rawTransactionStatus ?? "").trim().toLowerCase() === "closed";
              const hasComplianceIssue =
                (t.compliancePendingReviewCount ?? t.missingCount ?? 0) > 0 ||
                (t.complianceRejectedCount ?? t.rejectedCount ?? 0) > 0;
              const rowTint = isClosed
                ? "rgba(34, 197, 94, 0.09)"
                : hasComplianceIssue
                  ? "rgba(248, 113, 113, 0.1)"
                  : undefined;

              return (
                <Card
                  key={t.id}
                  onClick={() => openTransaction(t.id)}
                  style={{
                    cursor: "pointer",
                    ...(rowTint ? { backgroundColor: rowTint } : {}),
                  }}
                >
                  <CardContent style={{ padding: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>
                          {t.identifier}
                          {t.isArchived ? " (Archived)" : ""}
                        </div>

                        <div style={{ opacity: 0.8, marginTop: 4 }}>
                          {t.id} • {t.type} • {t.owner} • {t.organizationName}
                        </div>

                        <div style={{ opacity: 0.8, marginTop: 6 }}>
                          Due: {t.dueDate} • Last activity: {t.lastActivity}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          alignItems: "flex-end",
                        }}
                      >
                        <StatusBadge type={t.status as StatusType} label={t.statusLabel} />

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {needsAttention ? (
                            <Badge variant="destructive">
                              <AlertCircle style={{ width: 14, height: 14, marginRight: 6 }} />
                              Needs attention
                            </Badge>
                          ) : (
                            <Badge variant="secondary">On track</Badge>
                          )}

                          {(t.missingCount ?? 0) > 0 && (
                            <Badge variant="secondary">{t.missingCount} pending review</Badge>
                          )}

                          {(t.rejectedCount ?? 0) > 0 && (
                            <Badge variant="secondary">{t.rejectedCount} rejected</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}