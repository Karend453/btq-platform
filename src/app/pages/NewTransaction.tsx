import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Home,
  FileText,
  Users,
  CheckCircle2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { createTransaction } from "../../services/transactions";
import { getCurrentOffice } from "../../services/offices";
import {
  fetchActiveOfficeTemplatesForTransactionType,
  type ChecklistTemplate,
} from "../../services/checklistTemplates";
import { Label } from "../components/ui/label";

interface TransactionData {
  type: "Purchase" | "Listing" | "Lease" | "Other" | "";
  identifier: string;
  clientName: string;
  officeId: string;
  /** Optional `transactions.external_forms_url`; empty means unset. */
  formsWorkspaceUrl: string;
}

function isValidOptionalHttpUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Values for `transactions.transaction_side`; must stay aligned with transactionSideFlags() in services. */
function transactionSideFromWizardType(
  type: TransactionData["type"]
): string | null {
  if (!type) return null;
  switch (type) {
    case "Purchase":
      return "Buy side";
    case "Listing":
      return "Listing";
    case "Lease":
    case "Other":
    default:
      return type;
  }
}

export function NewTransaction() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [transactionData, setTransactionData] = useState<TransactionData>({
    type: "",
    identifier: "",
    clientName: "",
    officeId: "",
    formsWorkspaceUrl: "",
  });
  /** `offices.id` (UUID) → display label for the select and review step. */
  const [officeOptions, setOfficeOptions] = useState<{ id: string; name: string }[]>([]);
  const [officeLoadState, setOfficeLoadState] = useState<"loading" | "ready" | "empty">(
    "loading"
  );
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [checklistTemplateId, setChecklistTemplateId] = useState("");
  const [checklistTemplatesLoading, setChecklistTemplatesLoading] = useState(false);

  useEffect(() => {
    void getCurrentOffice().then((o) => {
      if (!o) {
        setOfficeOptions([]);
        setOfficeLoadState("empty");
        return;
      }
      const label = (o.display_name ?? o.name).trim() || o.name;
      setOfficeOptions([{ id: o.id, name: label }]);
      setOfficeLoadState("ready");
      setTransactionData((prev) => ({
        ...prev,
        officeId: prev.officeId || o.id,
      }));
    });
  }, []);

  useEffect(() => {
    const oid = transactionData.officeId.trim();
    const ty = transactionData.type;
    if (!oid || !ty) {
      setChecklistTemplates([]);
      setChecklistTemplateId("");
      setChecklistTemplatesLoading(false);
      return;
    }
    let cancelled = false;
    setChecklistTemplatesLoading(true);
    void fetchActiveOfficeTemplatesForTransactionType(oid, ty).then((list) => {
      if (cancelled) return;
      setChecklistTemplates(list);
      setChecklistTemplateId((prev) => {
        const p = prev.trim();
        if (list.length === 0) return "";
        if (p && list.some((t) => t.id === p)) return prev;
        return "";
      });
      setChecklistTemplatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [transactionData.officeId, transactionData.type]);

  const steps = [
    { number: 1, title: "Transaction Type", icon: FileText },
    { number: 2, title: "Address / Identifier", icon: Home },
    { number: 3, title: "Client & Office", icon: Users },
    { number: 4, title: "Review & Confirm", icon: CheckCircle2 },
  ];

  const transactionTypes = [
    { value: "Purchase", label: "Purchase", description: "Buyer representation" },
    { value: "Listing", label: "Listing", description: "Seller representation" },
    { value: "Lease", label: "Lease", description: "Rental transaction" },
    { value: "Other", label: "Other", description: "Custom transaction type" },
  ];

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

  const handleSubmit = async () => {
    try {
      const created = await createTransaction({
        identifier: transactionData.identifier,
        type: transactionData.type,
        clientName: transactionData.clientName,
        officeId: transactionData.officeId,
        checklistTemplateId,
        transactionSide: transactionSideFromWizardType(transactionData.type),
        externalFormsUrl: transactionData.formsWorkspaceUrl.trim() || null,
      });

      if (!created) {
        toast.error("Could not create transaction");
        return;
      }

      const intake = (created.intake_email ?? "").trim();
      if (intake) {
        toast.success("Transaction created", { description: intake });
      } else {
        toast.success("Transaction created");
      }

      navigate(`/transactions/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create transaction");
    }
  };

  const formsWorkspaceUrlTrimmed = transactionData.formsWorkspaceUrl.trim();
  const formsWorkspaceUrlInvalid =
    formsWorkspaceUrlTrimmed !== "" && !isValidOptionalHttpUrl(transactionData.formsWorkspaceUrl);

  const isStepValid = () => {
    if (formsWorkspaceUrlInvalid) return false;
    switch (currentStep) {
      case 1:
        return transactionData.type !== "";
      case 2:
        return transactionData.identifier.trim() !== "";
      case 3:
        return (
          officeLoadState === "ready" &&
          transactionData.clientName.trim() !== "" &&
          transactionData.officeId.trim() !== ""
        );
      case 4:
        return (
          transactionData.identifier.trim() !== "" &&
          transactionData.clientName.trim() !== "" &&
          transactionData.officeId.trim() !== ""
        );
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
                  Select the type of transaction you&apos;re creating, then choose the checklist
                  template for this office.
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

                {transactionData.type ? (
                  <div className="pt-2 space-y-2 border-t border-slate-200">
                    <Label htmlFor="checklistTemplate">Checklist Template</Label>
                    {officeLoadState !== "ready" || !transactionData.officeId.trim() ? (
                      <p className="text-sm text-slate-600">Loading office…</p>
                    ) : checklistTemplatesLoading ? (
                      <p className="text-sm text-slate-600">Loading checklist templates…</p>
                    ) : checklistTemplates.length === 0 ? (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        No active checklist template matches this transaction type for your office.
                        Ask your broker to add one under{" "}
                        <span className="font-medium">Office → Checklist templates</span> in Settings.
                      </p>
                    ) : (
                      <select
                        id="checklistTemplate"
                        value={checklistTemplateId}
                        onChange={(e) => setChecklistTemplateId(e.target.value)}
                        className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Select checklist template (optional)</option>
                        {checklistTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : null}
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
                    This will be used as the transaction file name.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Client & Office */}
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
      <Label htmlFor="officeId">Office</Label>
      <select
        id="officeId"
        value={transactionData.officeId}
        onChange={(e) =>
          setTransactionData({
            ...transactionData,
            officeId: e.target.value,
          })
        }
        className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Select an office</option>
        {officeOptions.map((office) => (
          <option key={office.id} value={office.id}>
            {office.name}
          </option>
        ))}
      </select>
    </div>

    <div>
      <Label htmlFor="formsWorkspaceUrl">Forms Workspace URL</Label>
      <Input
        id="formsWorkspaceUrl"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://forms.skyslope.com/..."
        value={transactionData.formsWorkspaceUrl}
        onChange={(e) =>
          setTransactionData({
            ...transactionData,
            formsWorkspaceUrl: e.target.value,
          })
        }
        className="mt-1.5"
        aria-invalid={formsWorkspaceUrlInvalid || undefined}
      />
      {formsWorkspaceUrlInvalid ? (
        <p className="text-sm text-red-600 mt-2" role="alert">
          Enter a valid URL starting with http:// or https://
        </p>
      ) : (
        <p className="text-sm text-slate-500 mt-2">
          Paste forms workspace URL if you&apos;ve already started the file.
        </p>
      )}
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
                    <div className="text-sm text-slate-600 mb-1">Checklist Template</div>
                    <div className="font-medium text-slate-900">
                      {checklistTemplates.find((t) => t.id === checklistTemplateId)?.name ?? "—"}
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
                      {officeOptions.find((o) => o.id === transactionData.officeId)?.name ?? "—"}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm text-slate-600 mb-1">Forms Workspace URL</div>
                    <div className="font-medium text-slate-900 break-all">
                      {formsWorkspaceUrlTrimmed || "—"}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 border-t border-slate-200 pt-4">
                    When you create this transaction, BTQ will assign a unique intake email. It will
                    appear in your confirmation and on the transaction page.
                  </p>
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
