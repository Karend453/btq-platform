import React, { useEffect, useMemo, useState } from "react";
import { useTerminology } from "../../hooks/useTerminology";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, AlertCircle, FileX, Archive, Lock } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
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
import type {
  ComplianceDominantState,
  ExportPackageListState,
  WorkItem,
} from "../../types/workItem";

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

const UUID_LINE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Single-line agent: first non-UUID line only (drops secondary id/UUID rows). */
function agentDisplaySingleLine(agent: string | undefined): string {
  if (agent == null || agent === "") return "—";
  const lines = agent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "—";
  const withoutUuidOnly = lines.filter((l) => !UUID_LINE.test(l));
  if (withoutUuidOnly.length > 0) return withoutUuidOnly[0].trim();
  return lines[0];
}

function exportPackageTooltipText(
  exportReady: boolean | undefined,
  state: ExportPackageListState | undefined
): string {
  if (exportReady) return "Export package ready";
  switch (state) {
    case "pending":
      return "Export package is being created";
    case "failed":
      return "Export failed";
    case "not_created":
      return "Export package not created yet";
    case "ready":
      return "Export package ready";
    default:
      return "Transaction is finalized, but the export package is not ready yet";
  }
}

/**
 * Workflow-first list ordering: active (Pre-Contract / Under Contract) → Closed → Finalized / Archived.
 * Lower tier sorts above. Within a tier, the user-selected sort still applies.
 */
function workflowOrderingTier(row: WorkItem): 0 | 1 | 2 {
  if (row.closingFinalized === true || row.isArchived) return 2;
  const st = (row.rawTransactionStatus ?? row.stage ?? "").trim().toLowerCase();
  if (st === "archived") return 2;
  if (row.workflowClosed === true || st === "closed") return 1;
  return 0;
}

function canOfferFinalizeClosing(row: WorkItem): boolean {
  return (
    row.workflowClosed === true &&
    row.closingFinalized !== true &&
    (row.missingRequiredCount ?? 0) === 0 &&
    (row.pendingReviewRequiredCount ?? 0) === 0 &&
    (row.rejectedRequiredCount ?? 0) === 0
  );
}

/** Query `?filter=` aligned with Compliance Overview dominant state (document engine). */
function parseComplianceFilterParam(raw: string | null): ComplianceDominantState | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "rejected" || v === "pending_review") return v;
  if (v === "pending") return "pending_review";
  return null;
}

export default function TransactionsPage() {
  const { terms } = useTerminology();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkItem[]>([]);

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
      const wa = workflowOrderingTier(a);
      const wb = workflowOrderingTier(b);
      if (wa !== wb) return wa - wb;

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
      (r) => r.complianceDominant === "rejected" || r.complianceDominant === "pending_review"
    ).length;

    const totalPendingReview = filteredRows.reduce(
      (sum, r) => sum + (r.compliancePendingReviewCount ?? 0),
      0
    );
    const totalRejected = filteredRows.reduce(
      (sum, r) => sum + (r.complianceRejectedCount ?? 0),
      0
    );

    return { needsAttention, totalPendingReview, totalRejected };
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
                {complianceFilter === "rejected" ? "Rejected" : "Pending Review"}{" "}
                ×
              </Badge>
            )}

            <Badge variant="secondary">
              <AlertCircle style={{ width: 14, height: 14, marginRight: 6 }} />
              {summary.needsAttention} need attention
            </Badge>

            <Badge variant="secondary">
              <FileX style={{ width: 14, height: 14, marginRight: 6 }} />
              {summary.totalPendingReview} pending review
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
                  <TableHead className="text-right min-w-[132px] pl-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((t) => {
                  const finalizedExportReady =
                    t.closingFinalized === true && t.exportPackageReady === true;
                  const finalizedAwaitingExport =
                    t.closingFinalized === true && t.exportPackageReady !== true;
                  return (
                  <TableRow
                    key={t.id}
                    className={
                      finalizedExportReady
                        ? "cursor-pointer border-l-4 border-l-emerald-600 bg-emerald-50/50"
                        : finalizedAwaitingExport
                          ? "cursor-pointer border-l-4 border-l-amber-500 bg-amber-50/50"
                          : "cursor-pointer"
                    }
                    onClick={() => openTransaction(t.id)}
                  >
                    <TableCell className="max-w-[220px] whitespace-normal px-2 py-3 leading-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{t.identifier}</span>
                        {t.closingFinalized ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center rounded-full">
                                  <Badge
                                    variant="outline"
                                    className={
                                      finalizedExportReady
                                        ? "h-6 shrink-0 rounded-full border-emerald-300 bg-emerald-50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
                                        : "h-6 shrink-0 rounded-full border-amber-300 bg-amber-50 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-950"
                                    }
                                  >
                                    Finalized
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-sm">
                                {exportPackageTooltipText(
                                  t.exportPackageReady,
                                  t.exportPackageListState
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                        {t.isArchived ? (
                          <span className="text-muted-foreground">(Archived)</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-3 text-muted-foreground">{t.type}</TableCell>
                    <TableCell className="px-2 py-3 leading-normal">
                      {agentDisplaySingleLine(t.agentDisplayName)}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {t.statusLabel ? (
                        <StatusBadge status={t.statusType as StatusType} label={t.status} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-muted-foreground">{t.stage}</TableCell>
                    <TableCell className="px-2 py-3 text-muted-foreground">
                      {formatClosingDisplay(t.closingDate)}
                    </TableCell>
                    <TableCell
                      className="min-w-[132px] py-3 pl-4 pr-3 text-right align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.closingFinalized ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex justify-end w-full pr-0.5">
                                <Lock
                                  className={`h-4 w-4 shrink-0 ${
                                    finalizedExportReady
                                      ? "text-emerald-600"
                                      : "text-amber-600"
                                  }`}
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                              {exportPackageTooltipText(
                                t.exportPackageReady,
                                t.exportPackageListState
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : canOfferFinalizeClosing(t) ? (
                        <button
                          type="button"
                          className="text-sm text-slate-500 hover:text-slate-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-sm px-1.5 py-1 -mr-0.5"
                          onClick={() =>
                            navigate(
                              `/transactions/${encodeURIComponent(t.id)}?finalize=1`
                            )
                          }
                        >
                          Finalize
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
