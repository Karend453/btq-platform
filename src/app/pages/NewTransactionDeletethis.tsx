import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export function NewTransaction() {
  const navigate = useNavigate();
  const [currentStep] = useState(1);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="outline" onClick={() => navigate("/transactions")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Transactions
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Step {currentStep}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>This page is rendering with UI components.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}