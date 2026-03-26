import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

type TransactionStatus =
  | "Pre-Contract"
  | "Under Contract"
  | "Closed"
  | "Archived";

interface CloseValidation {
  allowed: boolean;
  issues: string[];
}

interface TransactionOperationalFieldsCardProps {
  transactionStatus: TransactionStatus;
  assignedAdmin: string | null;
  contractDate: string | null;
  closingDate: string | null;
  adminOptions: string[];
  isReadOnly: boolean;
  closeValidation: CloseValidation;
  onTransactionStatusChange: (value: TransactionStatus) => void;
  onAssignedAdminChange: (value: string | null) => void;
  onContractDateChange: (value: string | null) => void;
  onClosingDateChange: (value: string | null) => void;
}

export function TransactionOperationalFieldsCard({
  transactionStatus,
  assignedAdmin,
  contractDate,
  closingDate,
  adminOptions,
  isReadOnly,
  closeValidation,
  onTransactionStatusChange,
  onAssignedAdminChange,
  onContractDateChange,
  onClosingDateChange,
}: TransactionOperationalFieldsCardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Status Dropdown */}
      <div>
        <Label
          htmlFor="transaction-status"
          className="text-sm font-medium text-slate-700 mb-1.5 block"
        >
          Status
        </Label>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select
                  value={transactionStatus}
                  onValueChange={(value) =>
                    onTransactionStatusChange(value as TransactionStatus)
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger id="transaction-status">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="Pre-Contract">Pre-Contract</SelectItem>
                    <SelectItem value="Under Contract">Under Contract</SelectItem>
                    <SelectItem
                      value="Closed"
                      disabled={!closeValidation.allowed}
                    >
                      Closed {!closeValidation.allowed && " 🔒"}
                    </SelectItem>
                    <SelectItem value="Archived" disabled>
                      Archived (use Archive button)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>

            {!closeValidation.allowed && transactionStatus !== "Closed" && (
              <TooltipContent side="right">
                <p className="text-sm">
                  Resolve required document issues before closing
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Assigned Admin */}
      <div>
        <Label
          htmlFor="assigned-admin"
          className="text-sm font-medium text-slate-700 mb-1.5 block"
        >
          Assigned Admin
        </Label>

        <Select
          value={assignedAdmin ?? "__UNASSIGNED__"}
          onValueChange={(value) =>
            onAssignedAdminChange(value === "__UNASSIGNED__" ? null : value)
          }
          disabled={isReadOnly}
        >
          <SelectTrigger id="assigned-admin">
            <SelectValue placeholder="Select admin" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="__UNASSIGNED__">Unassigned</SelectItem>
            {adminOptions.map((admin) => (
              <SelectItem key={admin} value={admin}>
                {admin}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contract Date */}
      <div>
        <Label
          htmlFor="contract-date"
          className="text-sm font-medium text-slate-700 mb-1.5 block"
        >
          Contract Date
        </Label>

        <Input
          id="contract-date"
          type="date"
          value={contractDate ?? ""}
          onChange={(e) =>
            onContractDateChange(e.target.value ? e.target.value : null)
          }
          disabled={isReadOnly}
        />
      </div>

      {/* Closing Date */}
      <div>
        <Label
          htmlFor="closing-date"
          className="text-sm font-medium text-slate-700 mb-1.5 block"
        >
          Closing Date
        </Label>

        <Input
          id="closing-date"
          type="date"
          value={closingDate ?? ""}
          onChange={(e) =>
            onClosingDateChange(e.target.value ? e.target.value : null)
          }
          disabled={isReadOnly}
        />
      </div>
    </div>
  );
}