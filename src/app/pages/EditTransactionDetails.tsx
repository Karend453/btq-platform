import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  computeCommissionBreakdown,
  DEFAULT_AGENT_SPLIT_PERCENT,
  getActiveCommissionSide,
  getAgentSplitPercentForTransaction,
  getTransaction,
  resolveAgentDisplayLabelForTransaction,
  updateTransaction,
  type TransactionRow,
} from "../../services/transactions";
import { getUserProfileRoleKey } from "../../services/auth";
import { Input } from "../components/ui/input";

/** DB numeric columns: '' → null; '0' → 0 */
function parseNullableNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Gross commission (sale price × commission %). */
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

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(2)}%`;
}

type FormData = {
  salePrice: string;
  commissionPercent: string;
  /** Gross commission (formerly "GCI"). Kept as `gci` in TS for DB column compat. */
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
  /**
   * v1 commission split: agent's split snapshot from `office_memberships`
   * (40% fallback). Broker/admin edit this from Team Management — this page
   * is read-only.
   *
   * TODO: when transaction-level overrides ship, prefer the override here
   * before falling back to membership.
   */
  const [agentSplitPercent, setAgentSplitPercent] = useState<number>(
    DEFAULT_AGENT_SPLIT_PERCENT,
  );
  /** Profile role key — drives which commission rows render (agent vs broker/admin). */
  const [viewerRoleKey, setViewerRoleKey] = useState<
    "admin" | "agent" | "broker" | "btq_admin" | null
  >(null);

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

      const split = await getAgentSplitPercentForTransaction(tx);
      setAgentSplitPercent(split);

      setIsLoading(false);
    }

    loadTransaction();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void getUserProfileRoleKey().then((key) => {
      if (!cancelled) setViewerRoleKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /**
   * Live commission breakdown for the read-only display strip. Reflects current
   * unsaved form input so the agent/broker can preview agent net + office net
   * before saving. Saved gross commission still gets persisted to the legacy
   * `gci` column (renamed in UI only); analytics also re-snapshot on finalize.
   */
  const breakdown = useMemo(() => {
    return computeCommissionBreakdown({
      salePrice: formData.salePrice,
      commissionPercent: formData.commissionPercent,
      grossCommission: formData.gci,
      referralFee: formData.referralFeeAmount,
      agentSplitPercent,
    });
  }, [
    formData.salePrice,
    formData.commissionPercent,
    formData.gci,
    formData.referralFeeAmount,
    agentSplitPercent,
  ]);

  const isAgentView = viewerRoleKey === "agent";

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
            <div className="text-xs font-medium text-slate-500">
              Gross Commission
            </div>
            <Input
              name="gci"
              value={formData.gci}
              placeholder="0"
              onChange={handleChange}
              inputMode="decimal"
              className="h-10 border-slate-200 bg-white shadow-none"
            />
            <p className="text-[11px] text-slate-500 leading-snug">
              Sale Price × Commission % (referral fee is deducted before the agent/office
              split below).
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">
              Referral Fee Amount
            </div>
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

      {/*
        v1 commission split summary — read-only on this page. Brokers/admins
        change the agent's split from Team Management. Math:
          gross         = sale price × commission %
          adjusted      = gross − referral fee
          agent net     = adjusted × agent split %
          office net    = adjusted − agent net
        Office retained % is always 100 − agent split.

        TODO: when transaction-level overrides (caps, luxury, graduated) ship,
        wire them in here and surface a "Override applied" badge.
      */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Commission Split</h2>
          <p className="text-xs text-slate-500">Set by your broker; not editable here.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-slate-500">Agent Split</div>
              <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatPercent(breakdown.agentSplitPercent)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Office Retained</div>
              <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatPercent(breakdown.officeRetainedPercent)}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-slate-500">Gross Commission</div>
              <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatCurrency(breakdown.grossCommission)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">
                Adjusted Gross
                <span className="ml-1 text-[11px] font-normal text-slate-400">
                  (after referral fee)
                </span>
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatCurrency(breakdown.adjustedGrossCommission)}
              </div>
            </div>

            {isAgentView ? (
              <div className="sm:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="text-xs font-medium text-emerald-700">
                  Your Net Commission
                </div>
                <div className="mt-1 text-xl font-semibold text-emerald-900 tabular-nums">
                  {formatCurrency(breakdown.agentNetCommission)}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs font-medium text-slate-500">Agent Payout</div>
                  <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(breakdown.agentNetCommission)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Office Net Commission
                  </div>
                  <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(breakdown.officeNetCommission)}
                  </div>
                </div>
              </>
            )}
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
