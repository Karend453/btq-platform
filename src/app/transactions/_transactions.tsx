import React, { useEffect, useMemo, useState } from "react";
import { useTerminology } from "../../hooks_temp/useTerminology";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

import { listTransactions } from "../../services/transactions";
import { getUserProfileRoleKey } from "../../services/auth";
import type { ComplianceDominantState, WorkItem } from "../../types/workItem";

type StatusFilter = "all" | StatusType;
type SortBy = "closingDate" | "agentName" | "address";

/** Strip leading street number so address sort orders by street name, not house number. */
function addressSortKey(identifier: string): string {
  const t = identifier.trim();
  const rest = t.replace(/^\d+[A-Za-z]?(?:\s*[-/]\s*\d+)?\s+/, "").trimStart();
  return rest || t;
}

/** Display ISO closing_date in the list (presentation only). */
function formatClosingDisplay(iso: string): string {
  const s = iso.trim();
  if (!s) return "—";
  const d = Date.parse(s);
  if (Number.isNaN(d)) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(d));
}

/** Query `?filter=` aligned with Compliance Overview dominant state (document engine). */
function parseComplianceFilterParam(raw: string | null): ComplianceDominantState | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "rejected" || v === "missing" || v === "pending_review") return v;
  if (v === "pending") return "pending_review";
  return null;
}

export default function TransactionsPage() {
  const { terms } = useTerminology();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkItem[]>([]);
  const [viewerIsBroker, setViewerIsBroker] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("closingDate");
  const [showArchived, setShowArchived] = useState(false);

  const complianceFilter = useMemo(
    () => parseComplianceFilterParam(searchParams.get("filter")),
    [searchParams]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const role = await getUserProfileRoleKey();
        const data = await listTransactions(role);
        if (!cancelled) {
          setRows(data);
          setViewerIsBroker(role === "broker");
        }
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
      .filter((r) => (statusFilter === "all" ? true : r.statusType === statusFilter))
      .filter((r) => {
        if (complianceFilter == null) return true;
        return r.complianceDominant === complianceFilter;
      })
      .filter((r) => {
        if (!q) return true;

        return (
          r.id.toLowerCase().includes(q) ||
          r.identifier.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          (r.owner ?? "").toLowerCase().includes(q) ||
          (r.agentDisplayName ?? "").toLowerCase().includes(q) ||
          (r.organizationName ?? "").toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.stage.toLowerCase().includes(q) ||
          r.risk.toLowerCase().includes(q)
        );
      });
  }, [rows, query, statusFilter, showArchived, complianceFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    const parseClosing = (w: WorkItem) => {
      const n = Date.parse(w.closingDate || "");
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

            {complianceFilter != null && (
              <Badge
                variant="outline"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("filter");
                    return next;
                  });
                }}
                title="Clear compliance filter"
              >
                Compliance:{" "}
                {complianceFilter === "rejected"
                  ? "Rejected"
                  : complianceFilter === "missing"
                    ? "Missing docs"
                    : "Awaiting review"}{" "}
                ×
              </Badge>
            )}

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
            placeholder="Search by ID, address, agent, workflow status, stage…"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div style={{ width: 220 }}>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter workflow status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workflow statuses</SelectItem>
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
          <div className="rounded-md border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Identifier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Closing date</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => openTransaction(t.id)}
                  >
                    <TableCell className="max-w-[220px] whitespace-normal">
                      {t.identifier}
                      {t.isArchived ? " (Archived)" : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.type}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{t.agentDisplayName ?? "—"}</span>
                        {viewerIsBroker && (t.organizationName ?? "").trim() !== "" && (
                          <span className="text-xs text-muted-foreground">
                            {t.organizationName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.statusType as StatusType} label={t.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.stage}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatClosingDisplay(t.closingDate)}
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal text-muted-foreground text-xs">
                      {t.risk}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
