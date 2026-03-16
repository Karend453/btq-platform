import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTransaction, updateTransaction } from "../../services/transactions";

type FormData = {
  listAgent: string;
  buyerAgent: string;
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
};

export default function EditTransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState<FormData>({
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
  });

  useEffect(() => {
    async function loadTransaction() {
      if (!id) {
        setIsLoading(false);
        return;
      }

      try {
        const transaction = await getTransaction(id);

        if (transaction) {
          setFormData({
              listAgent: "",
              buyerAgent: "",
              sellerNames: "",
              buyerNames: "",
              salePrice: "",
              type: transaction.type ?? "",
              checklistType: "",
              office: transaction.organizationName ?? "",
              listCommissionPercent: "",
              buyerCommissionPercent: "",
              listCommissionAmount: "",
              buyerCommissionAmount: "",
              contractDate: "",
              closingDate: "",
              admin: transaction.owner ?? "",
              status: transaction.statusLabel ?? "",
          });
        }
      } catch (error) {
        console.error("Failed to load transaction details:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTransaction();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        type: formData.type,
        office: formData.office,
        status: formData.status,
        assignedadmin: formData.admin,
        contractdate: formData.contractDate,
        closingdate: formData.closingDate,
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
        <h2 className="text-lg font-semibold">Transaction Basics</h2>
        <div className="grid grid-cols-2 gap-4">
          <input
            className="border rounded px-3 py-2"
            name="type"
            value={formData.type}
            placeholder="Type (Listing / Buyer)"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="checklistType"
            value={formData.checklistType}
            placeholder="Checklist Type"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="office"
            value={formData.office}
            placeholder="Office"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="salePrice"
            value={formData.salePrice}
            placeholder="Sale Price"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="status"
            value={formData.status}
            placeholder="Status"
            onChange={handleChange}
          />
        </div>
      </section>

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
        <h2 className="text-lg font-semibold">Dates + Intake + Commission</h2>
        <div className="grid grid-cols-2 gap-4">
          <input
            className="border rounded px-3 py-2"
            name="contractDate"
            value={formData.contractDate}
            type="date"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2"
            name="closingDate"
            value={formData.closingDate}
            type="date"
            onChange={handleChange}
          />

          <input
            className="border rounded px-3 py-2 bg-slate-100"
            value={id ? `txn-${id}@docs.btq.app` : ""}
            readOnly
            placeholder="Intake Email"
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