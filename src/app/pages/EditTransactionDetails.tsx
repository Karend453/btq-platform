import { useNavigate, useParams } from "react-router-dom";

export default function EditTransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Edit Transaction Details</h1>
          <p className="text-sm text-slate-600">Transaction ID: {id}</p>
        </div>

        <div className="bg-white border rounded-xl p-6">
          <p>This is the new Edit Transaction Details page.</p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/transactions")}
          className="px-4 py-2 border rounded"
        >
          Back to Transactions
        </button>
      </div>
    </div>
  );
}