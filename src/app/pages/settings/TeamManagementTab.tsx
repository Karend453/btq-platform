import React, { useCallback, useEffect, useState } from "react";
import { Mail, Plus, Trash2, UserMinus, Users } from "lucide-react";
import { getUserProfileRoleKey } from "../../../services/auth";
import { getCurrentOffice } from "../../../services/offices";
import { ACTIVE_OFFICE_CHANGED_EVENT } from "../dashboardOfficeStorage";
import {
  brokerAddOfficeMember,
  brokerDeactivateOfficeMember,
  brokerRemoveTeamInvite,
  brokerResendTeamInvite,
  formatOfficeRoleLabel,
  listOfficePendingRoster,
  listOfficeRoster,
  memberDisplayName,
  partitionCustomerRosterByRole,
  sortOfficeRosterMembers,
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

function RosterRoleCell({ row }: { row: OfficeRosterMember }) {
  const base = formatOfficeRoleLabel(row.role);
  if ((row.status ?? "").toLowerCase() !== "pending") {
    return <span>{base}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>
        {base} · Invite Pending
      </span>
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#e3d78a]"
        aria-hidden
      />
    </span>
  );
}

function RosterSection({
  title,
  description,
  rows,
  addRoleForSection,
  canManageTeam,
  onRequestAdd,
  onRemoveMember,
  onResendInvite,
  onRemoveInvite,
  removeBusyUserId,
  resendBusyUserId,
  pendingRemoveBusyUserId,
}: {
  title: string;
  description: string;
  rows: OfficeRosterMember[];
  addRoleForSection?: TeamAddableOfficeRole;
  canManageTeam?: boolean;
  onRequestAdd?: (role: TeamAddableOfficeRole) => void;
  onRemoveMember?: (member: OfficeRosterMember) => void;
  onResendInvite?: (member: OfficeRosterMember) => void;
  onRemoveInvite?: (member: OfficeRosterMember) => void;
  removeBusyUserId?: string | null;
  resendBusyUserId?: string | null;
  pendingRemoveBusyUserId?: string | null;
}) {
  const showAddButton = Boolean(canManageTeam && addRoleForSection && onRequestAdd);
  const showActionColumn = Boolean(
    canManageTeam && onRemoveMember && onResendInvite && onRemoveInvite,
  );
  if (rows.length === 0 && !showAddButton) return null;
  const colSpan = showActionColumn ? 4 : 3;
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
              disabled={
                removeBusyUserId != null ||
                resendBusyUserId != null ||
                pendingRemoveBusyUserId != null
              }
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
              {showActionColumn ? (
                <th scope="col" className="px-3 py-2 font-medium text-right whitespace-nowrap">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500 align-top" colSpan={colSpan}>
                  No {title.toLowerCase()} yet. Use the plus button above to add a team member.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const pending = (row.status ?? "").toLowerCase() === "pending";
                const rowBusy =
                  Boolean(pending && (resendBusyUserId === row.id || pendingRemoveBusyUserId === row.id)) ||
                  (!pending && removeBusyUserId === row.id);
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-slate-900 align-top">{memberDisplayName(row)}</td>
                    <td className="px-3 py-2.5 text-slate-900 align-top break-words">
                      {row.email?.trim() || row.invite_email?.trim() || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-900 align-top whitespace-nowrap">
                      <RosterRoleCell row={row} />
                    </td>
                    {showActionColumn ? (
                      <td className="px-3 py-2 align-top">
                        {pending ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
                              disabled={rowBusy}
                              onClick={() => onResendInvite?.(row)}
                            >
                              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                              Resend
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
                              disabled={rowBusy}
                              onClick={() => onRemoveInvite?.(row)}
                            >
                              <UserMinus className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="inline-flex rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
                              aria-label={`Remove ${memberDisplayName(row)}`}
                              disabled={rowBusy}
                              onClick={() => onRemoveMember?.(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                            </button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Team roster for the current office: active and pending `office_memberships`. Brokers add admins/agents and may
 * deactivate seats or manage pending invites.
 */
export function TeamManagementTab() {
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [members, setMembers] = useState<OfficeRosterMember[]>([]);
  const [hasOffice, setHasOffice] = useState(false);
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [viewerIsBroker, setViewerIsBroker] = useState(false);

  const [pendingAddRole, setPendingAddRole] = useState<TeamAddableOfficeRole | null>(null);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [addDuplicateTargetId, setAddDuplicateTargetId] = useState<string | null>(null);
  const [removeBusyUserId, setRemoveBusyUserId] = useState<string | null>(null);
  const [pendingResendBusyUserId, setPendingResendBusyUserId] = useState<string | null>(null);
  const [pendingRemoveBusyUserId, setPendingRemoveBusyUserId] = useState<string | null>(null);
  const [billingSyncWarning, setBillingSyncWarning] = useState<string | null>(null);

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
    const [active, pending] = await Promise.all([
      listOfficeRoster(office.id),
      listOfficePendingRoster(office.id),
    ]);
    if (active.error) {
      setRosterError(active.error);
      setMembers([]);
      setRosterLoading(false);
      return;
    }
    if (pending.error) {
      setRosterError(pending.error);
      setMembers([]);
      setRosterLoading(false);
      return;
    }
    setMembers(sortOfficeRosterMembers([...active.members, ...pending.members]));
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

  useEffect(() => {
    const handler = () => {
      void loadRoster();
    };
    window.addEventListener(ACTIVE_OFFICE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_OFFICE_CHANGED_EVENT, handler);
  }, [loadRoster]);

  const canManageTeam = Boolean(viewerIsBroker && officeId);

  const handleRequestAdd = useCallback((role: TeamAddableOfficeRole) => {
    setAddFormError(null);
    setAddDuplicateTargetId(null);
    setAddFirstName("");
    setAddLastName("");
    setAddEmail("");
    setPendingAddRole(role);
  }, []);

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingAddRole(null);
      setAddFirstName("");
      setAddLastName("");
      setAddEmail("");
      setAddFormError(null);
      setAddDuplicateTargetId(null);
      setAddSaving(false);
    }
  }, []);

  const submitAddMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!officeId || !pendingAddRole) return;
      setAddSaving(true);
      setAddFormError(null);
      setAddDuplicateTargetId(null);
      const { error, code, targetUserId } = await brokerAddOfficeMember({
        officeId,
        firstName: addFirstName,
        lastName: addLastName,
        email: addEmail,
        role: pendingAddRole,
      });
      setAddSaving(false);
      if (error) {
        setAddFormError(error.trim());
        if (code === "PENDING_MEMBERSHIP" && targetUserId) {
          setAddDuplicateTargetId(targetUserId);
        }
        return;
      }
      setPendingAddRole(null);
      setAddFirstName("");
      setAddLastName("");
      setAddEmail("");
      await loadRoster();
    },
    [addEmail, addFirstName, addLastName, loadRoster, officeId, pendingAddRole],
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
      setBillingSyncWarning(null);
      const { error, billingSyncWarning: syncWarn } = await brokerDeactivateOfficeMember({
        officeId,
        userId: member.id,
      });
      setRemoveBusyUserId(null);
      if (error) {
        setRosterError(error);
        return;
      }
      if (syncWarn) {
        setBillingSyncWarning(syncWarn);
      }
      await loadRoster();
    },
    [loadRoster, officeId],
  );

  const handlePendingResend = useCallback(
    async (member: OfficeRosterMember) => {
      if (!officeId) return;
      setPendingResendBusyUserId(member.id);
      setRosterError(null);
      setBillingSyncWarning(null);
      const { error } = await brokerResendTeamInvite({
        officeId,
        userId: member.id,
      });
      setPendingResendBusyUserId(null);
      if (error) {
        setRosterError(error);
        return;
      }
      await loadRoster();
    },
    [loadRoster, officeId],
  );

  const handlePendingRemove = useCallback(
    async (member: OfficeRosterMember) => {
      if (!officeId) return;
      const label = memberDisplayName(member);
      if (
        !confirm(
          `Remove the pending invite for ${label}? They will be removed from this list; you can add them again with a new invite.`,
        )
      ) {
        return;
      }
      setPendingRemoveBusyUserId(member.id);
      setRosterError(null);
      setBillingSyncWarning(null);
      const { error, billingSyncWarning: syncWarn } = await brokerRemoveTeamInvite({
        officeId,
        userId: member.id,
      });
      setPendingRemoveBusyUserId(null);
      if (error) {
        setRosterError(error);
        return;
      }
      if (syncWarn) {
        setBillingSyncWarning(syncWarn);
      }
      await loadRoster();
    },
    [loadRoster, officeId],
  );

  const handleDuplicateQuickResend = useCallback(async () => {
    if (!officeId || !addDuplicateTargetId) return;
    const stub: OfficeRosterMember = {
      id: addDuplicateTargetId,
      office_id: officeId,
      email: null,
      role: null,
      display_name: null,
      created_at: "",
    };
    await handlePendingResend(stub);
    setAddDuplicateTargetId(null);
    setAddFormError(null);
    setPendingAddRole(null);
  }, [addDuplicateTargetId, handlePendingResend, officeId]);

  const handleDuplicateQuickRemove = useCallback(async () => {
    if (!officeId || !addDuplicateTargetId) return;
    setPendingRemoveBusyUserId(addDuplicateTargetId);
    setRosterError(null);
    setBillingSyncWarning(null);
    const { error, billingSyncWarning: syncWarn } = await brokerRemoveTeamInvite({
      officeId,
      userId: addDuplicateTargetId,
    });
    setPendingRemoveBusyUserId(null);
    if (error) {
      setRosterError(error);
      return;
    }
    if (syncWarn) {
      setBillingSyncWarning(syncWarn);
    }
    setAddDuplicateTargetId(null);
    setAddFormError(null);
    setPendingAddRole(null);
    await loadRoster();
  }, [addDuplicateTargetId, loadRoster, officeId]);

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
          description="Admin seats count toward billable seats."
          rows={admins}
          canManageTeam={canManageTeam}
          addRoleForSection="admin"
          onRequestAdd={handleRequestAdd}
          onRemoveMember={handleRemoveMember}
          onResendInvite={handlePendingResend}
          onRemoveInvite={handlePendingRemove}
          removeBusyUserId={removeBusyUserId}
          resendBusyUserId={pendingResendBusyUserId}
          pendingRemoveBusyUserId={pendingRemoveBusyUserId}
        />
        <RosterSection
          title="Agents"
          description="Agent seats count toward billable seats."
          rows={agents}
          canManageTeam={canManageTeam}
          addRoleForSection="agent"
          onRequestAdd={handleRequestAdd}
          onRemoveMember={handleRemoveMember}
          onResendInvite={handlePendingResend}
          onRemoveInvite={handlePendingRemove}
          removeBusyUserId={removeBusyUserId}
          resendBusyUserId={pendingResendBusyUserId}
          pendingRemoveBusyUserId={pendingRemoveBusyUserId}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {billingSyncWarning ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          {billingSyncWarning}
        </div>
      ) : null}
      <Dialog open={pendingAddRole !== null} onOpenChange={handleAddDialogOpenChange}>
        <DialogContent className="border-slate-200 sm:max-w-md">
          <form onSubmit={submitAddMember}>
            <DialogHeader>
              <DialogTitle className="text-slate-900">
                {pendingAddRole === "admin" ? "Add an admin" : pendingAddRole === "agent" ? "Add an agent" : "Add member"}
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-base">
                New people receive an email to activate their account. If this email already has a BTQ account, they are
                attached to your office without a new signup.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="team-add-first" className="text-slate-700">
                    First name
                  </Label>
                  <Input
                    id="team-add-first"
                    type="text"
                    autoComplete="given-name"
                    value={addFirstName}
                    onChange={(ev) => setAddFirstName(ev.target.value)}
                    disabled={addSaving}
                    className="border-slate-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team-add-last" className="text-slate-700">
                    Last name
                  </Label>
                  <Input
                    id="team-add-last"
                    type="text"
                    autoComplete="family-name"
                    value={addLastName}
                    onChange={(ev) => setAddLastName(ev.target.value)}
                    disabled={addSaving}
                    className="border-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
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
                {pendingAddRole === "agent" || pendingAddRole === "admin" ? (
                  <p className="text-sm text-slate-600">
                    Seats are billed at $20/month per user.
                  </p>
                ) : null}
              </div>
              {addFormError ? (
                <div className="space-y-2" role="alert">
                  <p className="text-destructive text-sm leading-relaxed">{addFormError}</p>
                  {addDuplicateTargetId ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-200"
                        disabled={addSaving}
                        onClick={() => void handleDuplicateQuickResend()}
                      >
                        Resend invite
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-200"
                        disabled={addSaving}
                        onClick={() => void handleDuplicateQuickRemove()}
                      >
                        Remove invite
                      </Button>
                    </div>
                  ) : null}
                </div>
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
                All team members listed are included in billing. Invite status does not affect seat count.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-8">{rosterPanel}</CardContent>
      </Card>
    </div>
  );
}
