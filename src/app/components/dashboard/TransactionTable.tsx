import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { StatusBadge, StatusType } from "./StatusBadge";
import { ArrowUpDown, Lock } from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import type { ExportPackageListState } from "../../../types/workItem";
import { usePartnerDemoMode } from "../../../lib/partnerDemoMode";

export interface Transaction {
  id: string;
  address: string;
  agent: string;
  type: "Sale" | "Purchase" | "Lease";
  status: StatusType;
  statusLabel: string;
  amount: string;
  closingDate: string;
  documents?: number;
  missingDocs?: number;
  missingRequired: number;
  pendingReview: number;
  rejected: number;
  workflowClosed?: boolean;
  closingFinalized?: boolean;
  exportPackageReady?: boolean;
  exportPackageListState?: ExportPackageListState;
}

export type TransactionRow = Transaction;

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

const canOfferFinalizeFromDashboard = (transaction: TransactionRow) => {
  return (
    transaction.workflowClosed === true &&
    transaction.closingFinalized !== true &&
    transaction.missingRequired === 0 &&
    transaction.pendingReview === 0 &&
    transaction.rejected === 0
  );
};

interface TransactionTableProps {
  transactions: Transaction[];
  onRowClick?: (transaction: Transaction) => void;
  onRowDoubleClick?: (transaction: Transaction) => void;
  /** Navigates to transaction details with the existing finalize modal deep link. */
  onFinalizeClick?: (transaction: Transaction) => void;
}

type SortField = "address" | "agent" | "amount" | "closingDate";
type SortDirection = "asc" | "desc";

const UUID_LINE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip secondary UUID lines and keep a single agent display name. */
function agentNameOnly(agent: string): string {
  const lines = agent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return agent;
  const withoutUuidOnly = lines.filter((l) => !UUID_LINE.test(l));
  if (withoutUuidOnly.length > 0) return withoutUuidOnly[0].trim();
  return "—";
}

export function TransactionTable({
  transactions,
  onRowClick,
  onRowDoubleClick,
  onFinalizeClick,
}: TransactionTableProps) {
  const [sortField, setSortField] = useState<SortField>("closingDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  // Demo-mode hides workflow surface area: the Documents Complete column and
  // Finalize CTA both go away. Hover/sort behaviour on remaining columns is
  // unchanged.
  const partnerDemoMode = usePartnerDemoMode();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const fa = a.closingFinalized ? 1 : 0;
    const fb = b.closingFinalized ? 1 : 0;
    if (fa !== fb) return fa - fb;

    let aVal: string | number =
      sortField === "agent" ? agentNameOnly(a.agent) : a[sortField];
    let bVal: string | number =
      sortField === "agent" ? agentNameOnly(b.agent) : b[sortField];

    if (sortField === "amount") {
      aVal = parseFloat(a.amount.replace(/[$,]/g, ""));
      bVal = parseFloat(b.amount.replace(/[$,]/g, ""));
    }

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("address")}
                className="hover:bg-slate-100 -ml-3"
              >
                Property Address
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("agent")}
                className="hover:bg-slate-100 -ml-3"
              >
                Agent
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>Type</TableHead>
            {!partnerDemoMode && <TableHead>Status</TableHead>}
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("amount")}
                className="hover:bg-slate-100 -ml-3"
              >
                Amount
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("closingDate")}
                className="hover:bg-slate-100 -ml-3"
              >
                Closing Date
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </TableHead>
            {!partnerDemoMode && <TableHead>Documents</TableHead>}
            {!partnerDemoMode && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTransactions.map((transaction) => (
            <TableRow
              key={transaction.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => onRowClick?.(transaction)}
              onDoubleClick={() => onRowDoubleClick?.(transaction)}
            >
              <TableCell className="font-medium">
                {transaction.address}
              </TableCell>
              <TableCell>{agentNameOnly(transaction.agent)}</TableCell>
              <TableCell className="text-slate-600">
                {transaction.type}
              </TableCell>
              {!partnerDemoMode && (
                <TableCell>
                  {transaction.statusLabel ? (
                    <StatusBadge
                      status={transaction.status}
                      label={transaction.statusLabel}
                    />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
              )}
              <TableCell>{transaction.amount}</TableCell>
              <TableCell className="text-slate-600">
                {transaction.closingDate}
              </TableCell>
              {!partnerDemoMode && (
              <TableCell>
                {transaction.missingDocs ? (
                  <span className="text-red-600 font-medium">
                    {transaction.missingDocs} missing
                  </span>
                ) : (
                  <span className="text-emerald-600">
                    {transaction.documents || 0} complete
                  </span>
                )}
              </TableCell>
              )}
              {!partnerDemoMode && (
              <TableCell className="text-right">
                {transaction.closingFinalized ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex justify-end">
                          <Lock
                            className={`h-4 w-4 shrink-0 ${
                              transaction.exportPackageReady === true
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-sm">
                        {exportPackageTooltipText(
                          transaction.exportPackageReady,
                          transaction.exportPackageListState
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : canOfferFinalizeFromDashboard(transaction) && onFinalizeClick ? (
                  <button
                    type="button"
                    className="text-sm text-slate-500 hover:text-slate-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFinalizeClick(transaction);
                    }}
                  >
                    Finalize
                  </button>
                ) : null}
              </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
