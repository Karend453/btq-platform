import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Home,
  FileText,
  Users,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface TransactionData {
  type: "Purchase" | "Listing" | "Lease" | "Other" | "";
  identifier: string;
  clientName: string;
  clientEmail: string;
}

export function NewTransaction() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [transactionData, setTransactionData] = useState<TransactionData>({
    type: "",
    identifier: "",
    clientName: "",
    clientEmail: "",
  });

  const steps = [
    { number: 1, title: "Transaction Type", icon: FileText },
    { number: 2, title: "Identifier", icon: Home },
    { number: 3, title: "Primary Client", icon: Users },
    { number: 4, title: "Review & Confirm", icon: CheckCircle2 },
  ];

  const transactionTypes = [
    { value: "Purchase", label: "Purchase", description: "Buyer representation" },
    { value: "Listing", label: "Listing", description: "Seller representation" },
    { value: "Lease", label: "Lease", description: "Rental transaction" },
    { value: "Other", label: "Other", description: "Custom transaction type" },
  ];

  // Generate mock intake email based on identifier
  const generateIntakeEmail = () => {
    const randomId = Math.floor(Math.random() * 10000);
    return `txn-${randomId}@docs.btq.app`;
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    // Generate a mock transaction ID
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // In a real app, this would save to backend
    console.log("Creating transaction:", {
      id: transactionId,
      ...transactionData,
      status: "Pre-Contract",
      createdAt: new Date().toISOString(),
    });
    
    // Navigate to the transaction detail page
    navigate(`/transactions/${transactionId}`);
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return transactionData.type !== "";
      case 2:
        return transactionData.identifier.trim() !== "";
      case 3:
        return (
          transactionData.clientName.trim() !== "" &&
          transactionData.clientEmail.trim() !== ""
        );
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <Button
          variant="outline"
          onClick={() => navigate("/transactions")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Transactions
        </Button>

        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Start New Transaction
          </h1>
          <p className="text-slate-600 mt-1">
            Follow the steps below to create a new transaction
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.number;
            const isCompleted = currentStep > step.number;

            return (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isCompleted
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : isActive
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-300 text-slate-400"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-center mt-2">
                    <div
                      className={`text-xs font-medium ${
                        isActive || isCompleted
                          ? "text-slate-900"
                          : "text-slate-500"
                      }`}
                    >
                      Step {step.number}
                    </div>
                    <div
                      className={`text-xs ${
                        isActive || isCompleted
                          ? "text-slate-700"
                          : "text-slate-400"
                      }`}
                    >
                      {step.title}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 transition-colors ${
                      currentStep > step.number
                        ? "bg-emerald-600"
                        : "bg-slate-200"
                    }`}
                    style={{ marginBottom: "48px" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{steps[currentStep - 1].title}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Step 1: Transaction Type */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 mb-4">
                  Select the type of transaction you're creating. This will determine
                  the document checklist and workflow.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {transactionTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() =>
                        setTransactionData({
                          ...transactionData,
                          type: type.value as TransactionData["type"],
                        })
                      }
                      className={`p-4 rounded-lg border-2 text-left transition-all hover:border-blue-400 hover:bg-blue-50 ${
                        transactionData.type === type.value
                          ? "border-blue-600 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="font-medium text-slate-900">
                        {type.label}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {type.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Identifier */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="identifier">Property Address or File Name</Label>
                  <Input
                    id="identifier"
                    placeholder="e.g., 123 Main Street, Chicago, IL 60601"
                    value={transactionData.identifier}
                    onChange={(e) =>
                      setTransactionData({
                        ...transactionData,
                        identifier: e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    This will generate the transaction file name and intake email.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Primary Client */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    placeholder="e.g., John Smith"
                    value={transactionData.clientName}
                    onChange={(e) =>
                      setTransactionData({
                        ...transactionData,
                        clientName: e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="clientEmail">Client Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    placeholder="e.g., john.smith@email.com"
                    value={transactionData.clientEmail}
                    onChange={(e) =>
                      setTransactionData({
                        ...transactionData,
                        clientEmail: e.target.value,
                      })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div className="pt-2">
                  <Button variant="outline" disabled>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Additional Signer
                  </Button>
                  <p className="text-xs text-slate-500 mt-2">
                    Additional signers can be added after creating the transaction
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Review & Confirm */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <p className="text-sm text-slate-600">
                  Review the transaction details below before creating.
                </p>

                <div className="bg-slate-50 rounded-lg p-6 space-y-4 border border-slate-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-slate-600 mb-1">
                        Transaction Type
                      </div>
                      <div className="font-medium text-slate-900">
                        {transactionData.type}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Status</div>
                      <div className="font-medium text-slate-900">
                        Pre-Contract
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm text-slate-600 mb-1">
                      Property/Identifier
                    </div>
                    <div className="font-medium text-slate-900">
                      {transactionData.identifier}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm text-slate-600 mb-1">
                      Primary Client
                    </div>
                    <div className="font-medium text-slate-900">
                      {transactionData.clientName}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {transactionData.clientEmail}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm text-slate-600 mb-1">
                      Generated Intake Email
                    </div>
                    <div className="font-mono text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded border border-blue-200 inline-block">
                      {generateIntakeEmail()}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Documents sent to this email will automatically be added to
                      this transaction
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={!isStepValid()}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!isStepValid()}>
                <Check className="h-4 w-4 mr-2" />
                Create Transaction
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}