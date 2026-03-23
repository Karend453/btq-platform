import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  formatAgentLabelForList,
  getAssignedAgentDisplayNameFromRow,
  getTransaction,
  updateTransaction,
  type TransactionRow,
} from "../../services/transactions";

/** DB numeric columns: '' → null; '0' → 0 */
function parseNullableNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Commission text columns: '' → null; '0' preserved */
function parseNullableCommissionString(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  return t;
}

type FormData = {
  salePrice: string;
  listCommissionPercent: string;
  buyerCommissionPercent: string;
  listCommissionAmount: string;
  buyerCommissionAmount: string;
  gci: string;
  referralFeeAmount: string;
};

export default function EditTransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);

  const [formData, setFormData] = useState<FormData>({
    salePrice: "",
    listCommissionPercent: "",
    buyerCommissionPercent: "",
    listCommissionAmount: "",
    buyerCommissionAmount: "",
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

      setFormData({
        salePrice: tx.saleprice != null ? String(tx.saleprice) : "",
        listCommissionPercent: tx.listcommissionpercent ?? "",
        buyerCommissionPercent: tx.buyercommissionpercent ?? "",
        listCommissionAmount: tx.listcommissionamount ?? "",
        buyerCommissionAmount: tx.buyercommissionamount ?? "",
        gci: tx.gci != null ? String(tx.gci) : "",
        referralFeeAmount:
          tx.referral_fee_amount != null ? String(tx.referral_fee_amount) : "",
      });

      setIsLoading(false);
    }

    loadTransaction();
  }, [id]);

  const agentDisplayLabel = useMemo(() => {
    if (!transaction) return "—";
    const raw = getAssignedAgentDisplayNameFromRow(transaction);
    const formatted = formatAgentLabelForList(raw).trim();
    return formatted || "Unassigned";
  }, [transaction]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

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
      const { data, error } = await updateTransaction(id, {
        salePrice: parseNullableNumber(formData.salePrice),
        listCommissionPercent: parseNullableCommissionString(
          formData.listCommissionPercent
        ),
        buyerCommissionPercent: parseNullableCommissionString(
          formData.buyerCommissionPercent
        ),
        listCommissionAmount: parseNullableCommissionString(
          formData.listCommissionAmount
        ),
        buyerCommissionAmount: parseNullableCommissionString(
          formData.buyerCommissionAmount
        ),
        gci: parseNullableNumber(formData.gci),
        referralFeeAmount: parseNullableNumber(formData.referralFeeAmount),
      });

      if (error || !data) {
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
        <div className="grid grid-cols-2 gap-4">
          <input
            className="border rounded px-3 py-2"
            name="salePrice"
            value={formData.salePrice}
            placeholder="Sale Price"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="listCommissionPercent"
            value={formData.listCommissionPercent}
            placeholder="List Commission %"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="listCommissionAmount"
            value={formData.listCommissionAmount}
            placeholder="List Commission $"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="buyerCommissionPercent"
            value={formData.buyerCommissionPercent}
            placeholder="Buyer Commission %"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="buyerCommissionAmount"
            value={formData.buyerCommissionAmount}
            placeholder="Buyer Commission $"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="gci"
            value={formData.gci}
            placeholder="GCI"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="referralFeeAmount"
            value={formData.referralFeeAmount}
            placeholder="Referral Fee Amount"
            onChange={handleChange}
          />
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
