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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  UserPlus,
  X,
  Mail,
  HelpCircle,
  RotateCcw,
  Trash2,
  Send,
} from "lucide-react";
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

function initials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email[0]?.toUpperCase() || "?";
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
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
  const [resending, setResending] = useState<string | null>(null);

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
    if (result?.error) setError(result.error);
    else load();
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId) return;
    const result = await removeMember(orgId, memberId);
    if (result?.error) setError(result.error);
    else load();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">Members</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {members.length} member{members.length !== 1 ? "s" : ""}
            {invitations.length > 0 && ` · ${invitations.length} pending`}
          </p>
        </div>
        {permissions.canInviteMembers && (
          <Button size="sm" onClick={() => setShowInvite(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400/60 hover:text-red-400 shrink-0 ml-3">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Pending invitations */}
      {permissions.canInviteMembers && invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
            Pending Invitations
          </h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-4 rounded-xl border border-dashed px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {timeUntil(inv.expires_at)}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px] shrink-0">
                  {ROLE_LABELS[inv.role] || inv.role}
                </Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        onClick={() => handleResend(inv.id)}
                        disabled={resending === inv.id}
                        className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {resending === inv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent>Resend invitation</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        onClick={() => handleCancel(inv.id)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Cancel invitation</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
            Team Members
          </h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-left leading-relaxed">
                <strong>Admin</strong> — full access, manage members and settings<br />
                <strong>Power</strong> — manage repos, policies, keys, deploy<br />
                <strong>Read-only</strong> — view dashboard and reports
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          {!members || members.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-12 text-center">
              No members found.
            </p>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-4 px-4 py-3.5">
                  {/* Avatar */}
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-accent text-[11px] font-medium">
                      {initials(member.full_name, member.email)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name & email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">
                      {member.full_name || member.email}
                    </p>
                    {member.full_name && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {member.email}
                      </p>
                    )}
                  </div>

                  {/* Role */}
                  <div className="shrink-0">
                    {permissions.canManageMembers && member.role !== "admin" ? (
                      <Select
                        value={member.role}
                        onValueChange={(val) => val && handleRoleChange(member.id, val as OrgRole)}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="power">Power</SelectItem>
                          <SelectItem value="readonly">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    )}
                  </div>

                  {/* Joined */}
                  <span className="text-[12px] text-muted-foreground shrink-0 w-[80px] text-right">
                    {new Date(member.created_at).toLocaleDateString()}
                  </span>

                  {/* Remove */}
                  {permissions.canManageMembers ? (
                    <div className="shrink-0 w-[32px]">
                      {member.role !== "admin" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              onClick={() => handleRemove(member.id)}
                              className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Remove member</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation email to add someone to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
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
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                Role
              </label>
              <Select value={inviteRole} onValueChange={(val) => val && setInviteRole(val as OrgRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {permissions.canManageMembers && (
                    <SelectItem value="power">Power</SelectItem>
                  )}
                  <SelectItem value="readonly">Read-only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {inviteRole === "power"
                  ? "Can manage repos, policies, API keys, and deploy."
                  : "Can view the dashboard and reports. Cannot modify anything."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} size="sm" className="gap-1.5">
              {inviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
