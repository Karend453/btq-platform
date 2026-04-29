import React, { useEffect, useMemo, useState } from "react";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";
import {
  setPreferredFormsProvider,
  type FormsProviderValue,
  isFormsProviderValue,
} from "../../../services/auth";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useSettingsProfile } from "./SettingsProfileContext";

const PROVIDER_OPTIONS: { value: FormsProviderValue; label: string }[] = [
  { value: "dotloop", label: "Dotloop" },
  { value: "skyslope", label: "SkySlope" },
  { value: "zipforms", label: "ZipForms" },
  { value: "other", label: "Other" },
  { value: "none", label: "I do not use a forms provider" },
];

const UNSET_SENTINEL = "__unset__";

/**
 * User-level forms / e-sign provider preference. Stored as a label only — no credentials,
 * tokens, or usernames are persisted. Used to personalize transaction document workflows.
 */
export function FormsProviderTab() {
  const { profile } = useSettingsProfile();

  const initialValue: FormsProviderValue | null = useMemo(() => {
    const raw = profile?.preferred_forms_provider ?? null;
    return isFormsProviderValue(raw) ? raw : null;
  }, [profile?.preferred_forms_provider]);

  const [selected, setSelected] = useState<FormsProviderValue | null>(initialValue);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelected(initialValue);
  }, [initialValue]);

  const dirty = selected !== initialValue;

  async function handleSave() {
    setErrorMessage(null);
    setSavedHint(false);
    setSaving(true);
    try {
      const result = await setPreferredFormsProvider(selected);
      if (!result.ok) {
        setErrorMessage(result.message);
        toast.error(`Could not save forms provider: ${result.message}`);
        return;
      }
      setSavedHint(true);
      toast.success("Forms provider saved.");
      window.setTimeout(() => setSavedHint(false), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(message);
      toast.error(`Could not save forms provider: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const triggerValue = selected ?? UNSET_SENTINEL;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <FileSignature className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Forms Provider</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
                Choose the forms or e-sign platform you typically use. BTQ will use this to
                personalize document workflow shortcuts inside transactions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div className="space-y-2">
            <Label htmlFor="forms-provider-select" className="text-slate-900">
              Preferred provider
            </Label>
            <Select
              value={triggerValue}
              onValueChange={(v) => {
                if (v === UNSET_SENTINEL) {
                  setSelected(null);
                } else if (isFormsProviderValue(v)) {
                  setSelected(v);
                }
              }}
              disabled={saving}
            >
              <SelectTrigger
                id="forms-provider-select"
                className="sm:max-w-sm border-slate-200"
              >
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 leading-relaxed">
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            {savedHint ? <span className="text-xs text-slate-600">Saved.</span> : null}
          </div>

          {errorMessage ? (
            <p className="text-xs text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
