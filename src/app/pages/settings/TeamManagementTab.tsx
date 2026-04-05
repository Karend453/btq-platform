import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { getUserProfileRoleKey } from "../../../services/auth";
import { getCurrentOffice } from "../../../services/offices";
import {
  brokerAddOfficeMember,
  brokerDeactivateOfficeMember,
  formatOfficeRoleLabel,
  listOfficeRoster,
  memberDisplayName,
  partitionCustomerRosterByRole,
  type OfficeRosterMember,
  type TeamAddableOfficeRole,
} from "../../../services/officeRoster";
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

/** Maps RPC / PostgREST errors to short UI copy (no invite flow in v1). */
function formatAddMemberError(message: string): string {
  const m = message.trim();
  if (/no user found with that email/i.test(m)) {
    return "No account exists for that email yet. Invites are not available in this version — the person must sign up first.";
  }
  return m;
}

function RosterSection({
  title,
  description,
  rows,
  addRoleForSection,
  canManageTeam,
  onRequestAdd,
  onRemoveMember,
  removeBusyUserId,
}: {
  title: string;
  description: string;
  rows: OfficeRosterMember[];
  addRoleForSection?: TeamAddableOfficeRole;
  canManageTeam?: boolean;
  onRequestAdd?: (role: TeamAddableOfficeRole) => void;
  onRemoveMember?: (member: OfficeRosterMember) => void;
  removeBusyUserId?: string | null;
}) {
  const showAddButton = Boolean(canManageTeam && addRoleForSection && onRequestAdd);
  const showRemovePerRow = Boolean(canManageTeam && onRemoveMember);
  if (rows.length === 0 && !showAddButton) return null;
  const colSpan = showRemovePerRow ? 4 : 3;
  return (
    <div className="space-y-2">
      <div className="space-y-1 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {showAddButton && addRoleForSection ? (
            <button
              type="button"
              className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
              aria-label={`Add ${addRoleForSection} to ${title}`}
              disabled={removeBusyUserId != null}
              onClick={() => onRequestAdd?.(addRoleForSection)}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Name
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Email
              </th>
              <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                Role
              </th>
              {showRemovePerRow ? (
                <th scope="col" className="w-10 px-2 py-2 font-medium text-right" aria-label="Actions" />
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500 align-top" colSpan={colSpan}>
                  No {title.toLowerCase()} yet. Use the plus button above to add someone by email.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2.5 text-slate-900 align-top">{memberDisplayName(row)}</td>
                  <td className="px-3 py-2.5 text-slate-900 align-top break-words">
                    {row.email?.trim() || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-900 align-top whitespace-nowrap">
                    {formatOfficeRoleLabel(row.role)}
                  </td>
                  {showRemovePerRow ? (
                    <td className="px-2 py-2.5 align-top text-right">
                      <button
                        type="button"
                        className="inline-flex rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
                        aria-label={`Remove ${memberDisplayName(row)}`}
                        disabled={removeBusyUserId === row.id}
                        onClick={() => onRemoveMember?.(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Active roster from `office_memberships` for the current office. Brokers may add admins/agents (existing users
 * by email) or set memberships inactive; no Stripe or invitations in v1.
 */
export function TeamManagementTab() {
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [members, setMembers] = useState<OfficeRosterMember[]>([]);
  const [hasOffice, setHasOffice] = useState(false);
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [viewerIsBroker, setViewerIsBroker] = useState(false);

  const [pendingAddRole, setPendingAddRole] = useState<TeamAddableOfficeRole | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [removeBusyUserId, setRemoveBusyUserId] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    setRosterError(null);
    setRosterLoading(true);
    const [office, roleKey] = await Promise.all([getCurrentOffice(), getUserProfileRoleKey()]);
    setViewerIsBroker(roleKey === "broker");
    if (!office?.id) {
      setHasOffice(false);
      setOfficeId(null);
      setMembers([]);
      setRosterLoading(false);
      return;
    }
    setHasOffice(true);
    setOfficeId(office.id);
    const { members: list, error } = await listOfficeRoster(office.id);
    if (error) {
      setRosterError(error);
      setMembers([]);
      setRosterLoading(false);
      return;
    }
    setMembers(list);
    setRosterLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRoster().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadRoster]);

  const canManageTeam = Boolean(viewerIsBroker && officeId);

  const handleRequestAdd = useCallback((role: TeamAddableOfficeRole) => {
    setAddFormError(null);
    setAddEmail("");
    setPendingAddRole(role);
  }, []);

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingAddRole(null);
      setAddEmail("");
      setAddFormError(null);
      setAddSaving(false);
    }
  }, []);

  const submitAddMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!officeId || !pendingAddRole) return;
      setAddSaving(true);
      setAddFormError(null);
      const { error } = await brokerAddOfficeMember({
        officeId,
        email: addEmail,
        role: pendingAddRole,
      });
      setAddSaving(false);
      if (error) {
        setAddFormError(formatAddMemberError(error));
        return;
      }
      setPendingAddRole(null);
      setAddEmail("");
      await loadRoster();
    },
    [addEmail, loadRoster, officeId, pendingAddRole],
  );

  const handleRemoveMember = useCallback(
    async (member: OfficeRosterMember) => {
      if (!officeId) return;
      const label = memberDisplayName(member);
      if (
        !confirm(
          `Remove ${label} from this office? Their seat will be marked inactive and they will lose access until re-added.`,
        )
      ) {
        return;
      }
      setRemoveBusyUserId(member.id);
      setRosterError(null);
      const { error } = await brokerDeactivateOfficeMember({ officeId, userId: member.id });
      setRemoveBusyUserId(null);
      if (error) {
        setRosterError(error);
        return;
      }
      await loadRoster();
    },
    [loadRoster, officeId],
  );

  const { brokers, admins, agents } = partitionCustomerRosterByRole(members);
  const hasAnyRows = brokers.length + admins.length + agents.length > 0;
  const showRosterLayout = hasAnyRows || canManageTeam;

  let rosterPanel: React.ReactNode;
  if (rosterLoading) {
    rosterPanel = <p className="text-slate-600">Loading roster…</p>;
  } else if (!hasOffice) {
    rosterPanel = (
      <p className="text-slate-600 leading-relaxed">
        No office is linked to your account yet, or your workspace could not be loaded. Confirm your office assignment
        with your administrator if you expected to see your team.
      </p>
    );
  } else if (rosterError) {
    rosterPanel = (
      <p className="text-destructive text-sm leading-relaxed" role="alert">
        Could not load roster: {rosterError}
      </p>
    );
  } else if (!showRosterLayout) {
    rosterPanel = <p className="text-slate-600 leading-relaxed">No team members in this office yet.</p>;
  } else {
    rosterPanel = (
      <>
        <RosterSection
          title="Broker"
          description="Included with your base plan — not counted as an extra billable seat."
          rows={brokers}
        />
        <RosterSection
          title="Admins"
          description="Admin seats count toward billable seats when billing is live."
          rows={admins}
          canManageTeam={canManageTeam}
          addRoleForSection="admin"
          onRequestAdd={handleRequestAdd}
          onRemoveMember={handleRemoveMember}
          removeBusyUserId={removeBusyUserId}
        />
        <RosterSection
          title="Agents"
          description="Agent seats count toward billable seats when billing is live."
          rows={agents}
          canManageTeam={canManageTeam}
          addRoleForSection="agent"
          onRequestAdd={handleRequestAdd}
          onRemoveMember={handleRemoveMember}
          removeBusyUserId={removeBusyUserId}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={pendingAddRole !== null} onOpenChange={handleAddDialogOpenChange}>
        <DialogContent className="border-slate-200 sm:max-w-md">
          <form onSubmit={submitAddMember}>
            <DialogHeader>
              <DialogTitle className="text-slate-900">
                {pendingAddRole === "admin" ? "Add an admin" : pendingAddRole === "agent" ? "Add an agent" : "Add member"}
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-base">
                Enter the email on their BTQ account. If no account exists, you will see an error — invitations are not
                available yet.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="team-add-email" className="text-slate-700">
                Email
              </Label>
              <Input
                id="team-add-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={addEmail}
                onChange={(ev) => setAddEmail(ev.target.value)}
                disabled={addSaving}
                className="border-slate-200"
              />
              {addFormError ? (
                <p className="text-destructive text-sm leading-relaxed" role="alert">
                  {addFormError}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200"
                disabled={addSaving}
                onClick={() => handleAddDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800" disabled={addSaving}>
                {addSaving ? "Adding…" : "Add to office"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Team Management</CardTitle>
              <CardDescription className="text-slate-700 text-base leading-relaxed">
                Roster rows reflect active office memberships. As the broker, you can add admins and agents by email or
                deactivate a seat (membership is set to inactive, not deleted). Stripe billing is not connected here
                yet.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-8">{rosterPanel}</CardContent>
      </Card>
    </div>
  );
}
