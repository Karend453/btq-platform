import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertCircle, UserPlus, Users } from "lucide-react";
import {
  addOfficeAgent,
  getOfficeAgents,
  removeOfficeAgent,
  type OfficeAgent,
} from "../../../services/officeAgentsBilling";
import { getOfficeById } from "../../../services/offices";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useAuth } from "../../contexts/AuthContext";
import { useSettingsProfile } from "./SettingsProfileContext";

function roleLabelForDisplay(raw: string | null | undefined): string {
  const r = (raw ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "agent") return "Agent";
  if (r === "broker") return "Broker";
  return "—";
}

function displayNameForRow(row: OfficeAgent): string {
  const name = row.display_name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return "—";
}

type Banner = { variant: "default" | "destructive"; title: string; description: string };

/**
 * Broker-facing roster from `user_profiles`; add/remove actions use the service contract (mock until backend).
 */
export function ManageSubagentsTab() {
  const { user } = useAuth();
  const { profile } = useSettingsProfile();
  const currentUserId = user?.id ?? null;

  const [officeId, setOfficeId] = useState<string | null>(null);
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addFormError, setAddFormError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<OfficeAgent | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const [banner, setBanner] = useState<Banner | null>(null);

  const loadRoster = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    setRosterError(null);
    if (!silent) setRosterLoading(true);
    const oid = profile?.office_id?.trim();
    const office = oid ? await getOfficeById(oid) : null;
    if (!office?.id) {
      setOfficeId(null);
      setAgents([]);
      if (!silent) setRosterLoading(false);
      return;
    }
    setOfficeId(office.id);
    const { agents: list, error } = await getOfficeAgents(office.id);
    if (error) {
      setRosterError(error);
      setAgents([]);
      if (!silent) setRosterLoading(false);
      return;
    }
    setAgents(list);
    if (!silent) setRosterLoading(false);
  }, [profile?.office_id]);

  useEffect(() => {
    let cancelled = false;
    loadRoster().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadRoster]);

  const list = agents;
  const hasOffice = officeId !== null;

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (!officeId) return;
    setAddFormError(null);
    setBanner(null);
    setAddSubmitting(true);
    const result = await addOfficeAgent(officeId, {
      email: addEmail,
      display_name: addDisplayName.trim() || null,
    });
    setAddSubmitting(false);
    if (!result.ok) {
      setAddFormError(result.error);
      return;
    }
    setAddOpen(false);
    setAddEmail("");
    setAddDisplayName("");
    setBanner({
      variant: "default",
      title: "Preview only",
      description:
        "This request was not saved. The roster did not change. When billing and user provisioning are connected, adding an agent will update your team and may affect seat billing.",
    });
    await loadRoster({ silent: true });
  }

  async function confirmRemove() {
    if (!officeId || !removeTarget) return;
    setBanner(null);
    setRemoveSubmitting(true);
    const result = await removeOfficeAgent(officeId, removeTarget.id);
    setRemoveSubmitting(false);
    setRemoveTarget(null);
    if (!result.ok) {
      setBanner({
        variant: "destructive",
        title: "Could not complete preview",
        description: result.error,
      });
      return;
    }
    setBanner({
      variant: "default",
      title: "Preview only",
      description:
        "This request was not saved. The roster did not change. When billing and account tools are connected, removing an agent will update your team and may affect seat billing.",
    });
    await loadRoster({ silent: true });
  }

  return (
    <div className="space-y-4">
      {banner ? (
        <Alert variant={banner.variant === "destructive" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.description}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">Manage Subagents</CardTitle>
                <CardDescription className="text-slate-700 text-base leading-relaxed">
                  Your roster comes from BTQ profiles. Adding or removing agents may change billable seats
                  once billing is connected — actions below are preview-only until then.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              className="shrink-0 w-full sm:w-auto"
              onClick={() => {
                setAddFormError(null);
                setAddOpen(true);
              }}
              disabled={!hasOffice || rosterLoading}
            >
              <UserPlus className="h-4 w-4 mr-2" aria-hidden />
              Add Agent
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {rosterLoading ? (
            <p className="text-slate-600">Loading roster…</p>
          ) : !hasOffice ? (
            <p className="text-slate-600 leading-relaxed">
              No one is listed for your office yet, or your account isn&apos;t linked to an office. If
              you expected to see your team, confirm your office assignment with your administrator.
            </p>
          ) : rosterError ? (
            <p className="text-destructive text-sm leading-relaxed" role="alert">
              Could not load roster: {rosterError}
            </p>
          ) : list.length === 0 ? (
            <p className="text-slate-600 leading-relaxed">No agents in this office yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Role
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium text-right w-[7rem]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((row) => {
                    const isSelf = currentUserId != null && row.id === currentUserId;
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-2.5 text-slate-900 align-top">{displayNameForRow(row)}</td>
                        <td className="px-3 py-2.5 text-slate-900 align-top break-words">
                          {row.email?.trim() || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-900 align-top whitespace-nowrap">
                          {roleLabelForDisplay(row.role)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          {isSelf ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/30 hover:bg-destructive/5"
                              onClick={() => setRemoveTarget(row)}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddFormError(null);
            setAddEmail("");
            setAddDisplayName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddSubmit}>
            <DialogHeader>
              <DialogTitle>Add agent</DialogTitle>
              <DialogDescription>
                Preview only — this will not create an account or change billing yet. When provisioning
                is live, adding an agent may affect your subscription seats.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="add-agent-email">Email</Label>
                <Input
                  id="add-agent-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  disabled={addSubmitting}
                  placeholder="name@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-agent-name">Display name (optional)</Label>
                <Input
                  id="add-agent-name"
                  type="text"
                  autoComplete="name"
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  disabled={addSubmitting}
                  placeholder="Jane Agent"
                />
              </div>
              {addFormError ? (
                <p className="text-sm text-destructive" role="alert">
                  {addFormError}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={addSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addSubmitting}>
                {addSubmitting ? "Sending…" : "Submit preview"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open && !removeSubmitting) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove agent?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Preview only — this will not remove anyone from BTQ yet. When account tools are
                connected, removing an agent may reduce billable seats.
              </span>
              {removeTarget ? (
                <span className="block font-medium text-foreground">
                  {displayNameForRow(removeTarget)}
                  {removeTarget.email?.trim() ? ` (${removeTarget.email.trim()})` : ""}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSubmitting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={removeSubmitting}
              onClick={() => void confirmRemove()}
            >
              {removeSubmitting ? "Working…" : "Confirm preview"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
