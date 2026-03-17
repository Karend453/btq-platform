import { useState } from "react";
import { Mail, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export type GeneratedIntakeEmailProps = {
  intakeEmail?: string | null;
};

export default function GeneratedIntakeEmail({ intakeEmail }: GeneratedIntakeEmailProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyEmail = () => {
    if (!intakeEmail) return;
    navigator.clipboard.writeText(intakeEmail);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5" />
          Generated Intake Email
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 font-mono text-sm text-blue-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
              {intakeEmail ?? "—"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyEmail}
              className="flex-shrink-0"
              disabled={!intakeEmail}
            >
              {copySuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-slate-600">
            Send documents to this email address to automatically attach them
            to this transaction. All emails sent to this address will be parsed
            and filed accordingly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
