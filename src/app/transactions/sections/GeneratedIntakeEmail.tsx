import { useState } from "react";
import { Mail, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export type GeneratedIntakeEmailProps = {
  intakeEmail?: string | null;
  /** Sits with Documents / Inbox without a large standalone card */
  variant?: "default" | "compact";
};

export default function GeneratedIntakeEmail({
  intakeEmail,
  variant = "default",
}: GeneratedIntakeEmailProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyEmail = () => {
    if (!intakeEmail) return;
    navigator.clipboard.writeText(intakeEmail);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const body = (
    <div className={variant === "compact" ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
        <div
          className={
            variant === "compact"
              ? "flex-1 min-w-0 font-mono text-xs sm:text-sm text-blue-800 bg-blue-50/90 px-3 py-2 rounded-md border border-blue-200"
              : "flex-1 font-mono text-sm text-blue-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200"
          }
        >
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
      <p className={variant === "compact" ? "text-xs text-slate-600" : "text-sm text-slate-600"}>
        Send documents to this address to file them into this transaction&apos;s inbox and
        checklist.
      </p>
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
        <div className="flex items-center gap-2 text-slate-900 font-medium text-sm mb-2">
          <Mail className="h-4 w-4 text-slate-600 flex-shrink-0" />
          Intake email
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5" />
          Generated Intake Email
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
