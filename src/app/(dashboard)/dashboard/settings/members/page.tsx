"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrg } from "@/components/org-context";
import {
  getMembers,
  getInvitations,
  inviteMember,
  resendInvitation,
  cancelInvitation,
  changeMemberRole,
  removeMember,
} from "../../actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, UserPlus, X, Clock, Mail } from "lucide-react";
import type { OrgRole } from "@/lib/types/database";

interface Member {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  created_at: string;
}

export default function MembersPage() {
  const { orgId, permissions } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("readonly");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [m, inv] = await Promise.all([
        getMembers(orgId),
        permissions.canInviteMembers ? getInvitations(orgId) : Promise.resolve([]),
      ]);
      setMembers(m as Member[]);
      setInvitations(inv as Invitation[]);
    } finally {
      setLoading(false);
    }
  }, [orgId, permissions.canInviteMembers]);

  useEffect(() => {
    load();
  }, [load]);
  useInterval(load, 10000);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;
    setInviting(true);
    setError("");
    const result = await inviteMember(orgId, inviteEmail.trim(), inviteRole);
    if (result.error) {
      setError(result.error);
      setInviting(false);
    } else {
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("readonly");
      setInviting(false);
      load();
    }
  };

  const [resending, setResending] = useState<string | null>(null);

  const handleResend = async (invId: string) => {
    if (!orgId) return;
    setResending(invId);
    setError("");
    try {
      const result = await resendInvitation(orgId, invId);
      if (result?.error) setError(result.error);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resend");
    } finally {
      setResending(null);
    }
  };

  const handleCancel = async (invId: string) => {
    if (!orgId) return;
    await cancelInvitation(orgId, invId);
    load();
  };

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    if (!orgId) return;
    const result = await changeMemberRole(orgId, memberId, newRole);
    if (result?.error) {
      setError(result.error);
    } else {
      load();
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId) return;
    const result = await removeMember(orgId, memberId);
    if (result?.error) {
      setError(result.error);
    } else {
      load();
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Members</h1>
        {permissions.canInviteMembers && (
          <Button size="sm" onClick={() => setShowInvite(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400/60 hover:text-red-400">
            <X className="h-3 w-3 inline" />
          </button>
        </div>
      )}

      {/* Pending invitations */}
      {permissions.canInviteMembers && invitations.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending Invitations
          </h2>
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full border-collapse">
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[13px] text-secondary-foreground">{inv.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{ROLE_LABELS[inv.role] || inv.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] text-muted-foreground">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleResend(inv.id)}
                          disabled={resending === inv.id}
                          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {resending === inv.id ? "Sending..." : "Resend"}
                        </button>
                        <button
                          onClick={() => handleCancel(inv.id)}
                          className="text-[12px] text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-2xl border overflow-hidden">
        {!members || members.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No members found.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  User
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Joined
                </th>
                {permissions.canManageMembers && (
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-[13px] text-secondary-foreground">
                        {member.full_name || member.email}
                      </span>
                      {member.full_name && (
                        <span className="text-[12px] text-muted-foreground ml-2">
                          {member.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {permissions.canManageMembers && member.role !== "admin" ? (
                      <Select
                        value={member.role}
                        onValueChange={(val) => val && handleRoleChange(member.id, val as OrgRole)}
                      >
                        <SelectTrigger className="w-[100px] h-7 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="power">Power</SelectItem>
                          <SelectItem value="readonly">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[member.role] || member.role}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  {permissions.canManageMembers && (
                    <td className="px-4 py-3 text-right">
                      {member.role !== "admin" && (
                        <button
                          onClick={() => handleRemove(member.id)}
                          className="text-[12px] text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
                Email address
              </label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
                Role
              </label>
              <Select value={inviteRole} onValueChange={(val) => val && setInviteRole(val as OrgRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {permissions.canManageMembers && (
                    <SelectItem value="power">Power -- manage repos, policies, keys</SelectItem>
                  )}
                  <SelectItem value="readonly">Read-only -- view only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} size="sm">
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
