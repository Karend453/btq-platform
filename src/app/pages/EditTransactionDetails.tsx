import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getActiveCommissionSide,
  getTransaction,
  resolveAgentDisplayLabelForTransaction,
  updateTransaction,
  type TransactionRow,
} from "../../services/transactions";
import { Input } from "../components/ui/input";

/** DB numeric columns: '' → null; '0' → 0 */
function parseNullableNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Gross commission income (sale price × commission %). */
function computeGciFromSaleAndPercent(
  salePriceRaw: string,
  percentRaw: string
): string {
  const pct = percentRaw.trim();
  if (pct === "") return "";
  const p = Number(pct);
  if (!Number.isFinite(p)) return "";
  const sp = parseNullableNumber(salePriceRaw);
  if (sp == null) return "";
  const dollars = (sp * p) / 100;
  if (!Number.isFinite(dollars)) return "";
  const rounded = Math.round(dollars * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
}

/** Commission text columns: '' → null; '0' preserved */
function parseNullableCommissionString(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  return t;
}

type FormData = {
  salePrice: string;
  commissionPercent: string;
  gci: string;
  referralFeeAmount: string;
};

export default function EditTransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  /** Resolved once per load; drives list_* vs buyer_* save mapping. */
  const [commissionSide, setCommissionSide] = useState<"list" | "buyer" | null>(
    null
  );
  const [agentDisplayLabel, setAgentDisplayLabel] = useState("—");

  const [formData, setFormData] = useState<FormData>({
    salePrice: "",
    commissionPercent: "",
    gci: "",
    referralFeeAmount: "",
  });

  useEffect(() => {
    async function loadTransaction() {
      if (!id) return;

      setIsLoading(true);
      setTransaction(null);

      const tx = await getTransaction(id);

      if (!tx) {
        setTransaction(null);
        setIsLoading(false);
        return;
      }

      setTransaction(tx);

      const side = getActiveCommissionSide(tx);
      setCommissionSide(side);
      const unifiedPercent =
        side === "list"
          ? (tx.listcommissionpercent ?? "")
          : (tx.buyercommissionpercent ?? "");
      const legacyCommissionDollar =
        side === "list"
          ? (tx.listcommissionamount ?? "")
          : (tx.buyercommissionamount ?? "");
      const saleStr = tx.saleprice != null ? String(tx.saleprice) : "";
      const fromFormula = computeGciFromSaleAndPercent(saleStr, unifiedPercent);
      const gciInitial =
        tx.gci != null
          ? String(tx.gci)
          : fromFormula !== ""
            ? fromFormula
            : legacyCommissionDollar.trim() !== ""
              ? legacyCommissionDollar.trim()
              : "";

      setFormData({
        salePrice: saleStr,
        commissionPercent: unifiedPercent,
        gci: gciInitial,
        referralFeeAmount:
          tx.referral_fee_amount != null ? String(tx.referral_fee_amount) : "",
      });

      setIsLoading(false);
    }

    loadTransaction();
  }, [id]);

  useEffect(() => {
    if (!transaction) {
      setAgentDisplayLabel("—");
      return;
    }
    let cancelled = false;
    void resolveAgentDisplayLabelForTransaction(transaction).then((label) => {
      if (!cancelled) setAgentDisplayLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [transaction]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "salePrice") {
      setFormData((prev) => {
        const next = { ...prev, salePrice: value };
        if (prev.commissionPercent.trim() !== "") {
          return {
            ...next,
            gci: computeGciFromSaleAndPercent(value, prev.commissionPercent),
          };
        }
        return next;
      });
      return;
    }

    if (name === "commissionPercent") {
      setFormData((prev) => {
        const next = { ...prev, commissionPercent: value };
        if (value.trim() === "") {
          return next;
        }
        return {
          ...next,
          gci: computeGciFromSaleAndPercent(prev.salePrice, value),
        };
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    if (!id) {
      return;
    }

    try {
      const side = commissionSide ?? "list";
      const pct = parseNullableCommissionString(formData.commissionPercent);

      const { error } = await updateTransaction(id, {
        salePrice: parseNullableNumber(formData.salePrice),
        listCommissionPercent:
          side === "list" ? pct : null,
        buyerCommissionPercent:
          side === "buyer" ? pct : null,
        listCommissionAmount: null,
        buyerCommissionAmount: null,
        gci: parseNullableNumber(formData.gci),
        referralFeeAmount: parseNullableNumber(formData.referralFeeAmount),
      });

      if (error) {
        console.error("[EditTransactionDetails] updateTransaction", error);
        toast.error(error?.message ?? "Failed to save transaction details.");
        return;
      }

      navigate(`/transactions/${id}`);
    } catch (error) {
      console.error("Failed to save transaction details:", error);
      alert("Failed to save transaction details.");
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading transaction details...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Edit Transaction Details</h1>
        <p className="text-sm text-slate-600">Transaction ID: {id}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">People</h2>
        <div className="max-w-md">
          <div className="mb-1 text-xs font-medium text-slate-500">Agent</div>
          <div
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900"
            aria-readonly
          >
            {agentDisplayLabel}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Financial Details</h2>
        <div className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">Sale Price</div>
            <Input
              name="salePrice"
              value={formData.salePrice}
              placeholder="0"
              onChange={handleChange}
              inputMode="decimal"
              className="h-10 border-slate-200 bg-white shadow-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">Commission %</div>
            <Input
              name="commissionPercent"
              value={formData.commissionPercent}
              placeholder="0"
              onChange={handleChange}
              inputMode="decimal"
              className="h-10 border-slate-200 bg-white shadow-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">GCI</div>
            <Input
              name="gci"
              value={formData.gci}
              placeholder="0"
              onChange={handleChange}
              inputMode="decimal"
              className="h-10 border-slate-200 bg-white shadow-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">Referral Fee Amount</div>
            <Input
              name="referralFeeAmount"
              value={formData.referralFeeAmount}
              placeholder="0"
              onChange={handleChange}
              inputMode="decimal"
              className="h-10 border-slate-200 bg-white shadow-none"
            />
          </div>
        </div>
      </section>

      <div className="flex gap-4">
        <button
          className="px-4 py-2 bg-black text-white rounded"
          onClick={handleSave}
        >
          Save Details
        </button>

        <button
          className="px-4 py-2 border rounded"
          onClick={() => navigate(`/transactions/${id}`)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
