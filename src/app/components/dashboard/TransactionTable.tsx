import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { StatusBadge, StatusType } from "./StatusBadge";
import { ArrowUpDown } from "lucide-react";
import { Button } from "../ui/button";

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
}

interface TransactionTableProps {
  transactions: Transaction[];
  onRowClick?: (transaction: Transaction) => void;
  onRowDoubleClick?: (transaction: Transaction) => void;
}

type SortField = "address" | "agent" | "amount" | "closingDate";
type SortDirection = "asc" | "desc";

export function TransactionTable({
  transactions,
  onRowClick,
  onRowDoubleClick,
}: TransactionTableProps) {
  const [sortField, setSortField] = useState<SortField>("closingDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    let aVal: string | number = a[sortField];
    let bVal: string | number = b[sortField];

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
            <TableHead>Status</TableHead>
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
            <TableHead>Documents</TableHead>
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
              <TableCell>{transaction.agent}</TableCell>
              <TableCell className="text-slate-600">
                {transaction.type}
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={transaction.status}
                  label={transaction.statusLabel}
                />
              </TableCell>
              <TableCell>{transaction.amount}</TableCell>
              <TableCell className="text-slate-600">
                {transaction.closingDate}
              </TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}