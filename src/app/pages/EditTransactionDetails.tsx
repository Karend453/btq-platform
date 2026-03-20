import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTransaction, updateTransaction, type TransactionRow } from "../../services/transactions";

type FormData = {
  listAgent: string;
  buyerAgent: string;
  clientName: string;
  identifier: string;
  sellerNames: string;
  buyerNames: string;
  salePrice: string;
  type: string;
  checklistType: string;
  office: string;
  listCommissionPercent: string;
  buyerCommissionPercent: string;
  listCommissionAmount: string;
  buyerCommissionAmount: string;
  contractDate: string;
  closingDate: string;
  admin: string;
  status: string;
  transactionSide: string;
  transactionCategory: string;
  leadSource: string;
  gci: string;
  referralFeeAmount: string;
};

export default function EditTransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);

  const [formData, setFormData] = useState<FormData>({
    identifier: "",
    clientName: "",
    listAgent: "",
    buyerAgent: "",
    sellerNames: "",
    buyerNames: "",
    salePrice: "",
    type: "",
    checklistType: "",
    office: "",
    listCommissionPercent: "",
    buyerCommissionPercent: "",
    listCommissionAmount: "",
    buyerCommissionAmount: "",
    contractDate: "",
    closingDate: "",
    admin: "",
    status: "",
    transactionSide: "",
    transactionCategory: "",
    leadSource: "",
    gci: "",
    referralFeeAmount: "",
  });

  useEffect(() => {
    async function loadTransaction() {
      if (!id) return;
  
      setIsLoading(true);
  
      const tx = await getTransaction(id);
  
      if (!tx) {
        setTransaction(null);
        setIsLoading(false);
        return;
      }
  
      setTransaction(tx);
  
      setFormData({
        identifier: tx.identifier ?? "",
        clientName: tx.clientname ?? "",
        listAgent: tx.listagent ?? "",
        buyerAgent: tx.buyeragent ?? "",
        sellerNames: tx.sellernames ?? "",
        buyerNames: tx.buyernames ?? "",
        salePrice: tx.saleprice != null ? String(tx.saleprice) : "",
        type: tx.type ?? "",
        checklistType: tx.checklisttype ?? "",
        office: tx.office ?? "",
        listCommissionPercent: tx.listcommissionpercent ?? "",
        buyerCommissionPercent: tx.buyercommissionpercent ?? "",
        listCommissionAmount: tx.listcommissionamount ?? "",
        buyerCommissionAmount: tx.buyercommissionamount ?? "",
        contractDate: tx.contractdate ?? "",
        closingDate: tx.closing_date ?? "",
        admin: tx.assignedadmin ?? "",
        status: tx.status ?? "",
        transactionSide: tx.transaction_side ?? "",
        transactionCategory: tx.transaction_category ?? "",
        leadSource: tx.lead_source ?? "",
        gci: tx.gci != null ? String(tx.gci) : "",
        referralFeeAmount:
          tx.referral_fee_amount != null ? String(tx.referral_fee_amount) : "",
      });
  
      setIsLoading(false);
    }
  
    loadTransaction();
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    console.log("SAVE CLICKED");
    console.log("id:", id);
    console.log("formData:", formData);
  
    if (!id) {
      console.log("No id, stopping save");
      return;
    }
  
    try {
      const result = await updateTransaction(id, {
        type: formData.type || null,
        office: formData.office || null,
        status: formData.status || null,
        admin: formData.admin || null,
        contractDate: formData.contractDate || null,
        closingDate: formData.closingDate || null,
      
        sellerNames: formData.sellerNames || null,
        buyerNames: formData.buyerNames || null,
        salePrice: formData.salePrice ? Number(formData.salePrice) : null,
        checklistType: formData.checklistType || null,
      
        listAgent: formData.listAgent || null,
        buyerAgent: formData.buyerAgent || null,
        listCommissionPercent: formData.listCommissionPercent || null,
        buyerCommissionPercent: formData.buyerCommissionPercent || null,
        listCommissionAmount: formData.listCommissionAmount || null,
        buyerCommissionAmount: formData.buyerCommissionAmount || null,

        transactionSide: formData.transactionSide || null,
        transactionCategory: formData.transactionCategory || null,
        leadSource: formData.leadSource || null,
        gci: formData.gci ? Number(formData.gci) : null,
        referralFeeAmount: formData.referralFeeAmount
          ? Number(formData.referralFeeAmount)
          : null,
      });
  
      console.log("updateTransaction result:", result);
  
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
        <div className="grid grid-cols-2 gap-4">
          <input
            className="border rounded px-3 py-2"
            name="listAgent"
            value={formData.listAgent}
            placeholder="List Agent"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="buyerAgent"
            value={formData.buyerAgent}
            placeholder="Buyer Agent"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="sellerNames"
            value={formData.sellerNames}
            placeholder="Seller Names"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="buyerNames"
            value={formData.buyerNames}
            placeholder="Buyer Names"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="admin"
            value={formData.admin}
            placeholder="Assigned Admin / Reviewer"
            onChange={handleChange}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Intake + Pricing + Commission</h2>
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
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Reporting + Classification</h2>
        <div className="grid grid-cols-2 gap-4">
          <select
            className="border rounded px-3 py-2"
            name="transactionSide"
            value={formData.transactionSide}
            onChange={handleChange}
          >
            <option value="">Side of Transaction</option>
            <option value="Buyer">Buyer</option>
            <option value="Seller">Seller</option>
            <option value="Dual">Dual</option>
            <option value="Referral">Referral</option>
          </select>

          <select
            className="border rounded px-3 py-2"
            name="transactionCategory"
            value={formData.transactionCategory}
            onChange={handleChange}
          >
            <option value="">Transaction Category</option>
            <option value="Resale">Resale</option>
            <option value="New Construction">New Construction</option>
            <option value="Land">Land</option>
            <option value="Lease">Lease</option>
            <option value="Referral">Referral</option>
          </select>

          <input
            className="border rounded px-3 py-2"
            name="leadSource"
            value={formData.leadSource}
            placeholder="Lead Source"
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