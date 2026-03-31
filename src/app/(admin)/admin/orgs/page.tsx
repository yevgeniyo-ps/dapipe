"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  listOrgs,
  getOrgDetail,
  createOrg,
  updateOrg,
  deleteOrg,
  addOrgMember,
  removeOrgMember,
  changeOrgMemberRole,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/types/database";

interface Org {
  id: string;
  name: string;
  slug: string;
  members_count: number;
  repos_count: number;
  reports_count: number;
  last_report_at: string | null;
  created_at: string;
}

interface OrgDetailData {
  org: any;
  members: any[];
  repos: any[];
  policies: any[];
  api_keys: any[];
  reports: any[];
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Org | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add member form
  const [addMemberOrgId, setAddMemberOrgId] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<OrgRole>("member");
  const [addingMember, setAddingMember] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await listOrgs();
      setOrgs((result.orgs || []) as Org[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleExpand = async (orgId: string) => {
    if (expandedId === orgId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(orgId);
    setDetailLoading(true);
    try {
      const result = await getOrgDetail(orgId);
      if (result.error) {
        setError(result.error);
      } else {
        setDetail(result as OrgDetailData);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setError("");
    const slug =
      createSlug.trim() ||
      createName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const result = await createOrg(createName.trim(), slug);
    if (result.error) {
      setError(result.error);
    } else {
      setShowCreate(false);
      setCreateName("");
      setCreateSlug("");
      load();
    }
    setCreating(false);
  };

  const handleEdit = async () => {
    if (!editOrg || !editName.trim()) return;
    setSaving(true);
    setError("");
    const result = await updateOrg(editOrg.id, editName.trim(), editSlug.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setEditOrg(null);
      load();
      if (expandedId === editOrg.id) handleExpand(editOrg.id);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    const result = await deleteOrg(deleteTarget.id);
    if (result.error) {
      setError(result.error);
    } else {
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setDetail(null);
      }
      load();
    }
    setDeleting(false);
  };

  const handleAddMember = async () => {
    if (!addMemberOrgId || !addMemberEmail.trim()) return;
    setAddingMember(true);
    setError("");
    const result = await addOrgMember(addMemberOrgId, addMemberEmail.trim(), addMemberRole);
    if (result.error) {
      setError(result.error);
    } else {
      setAddMemberEmail("");
      setAddMemberRole("member");
      handleExpand(addMemberOrgId);
      load();
    }
    setAddingMember(false);
  };

  const handleRemoveMember = async (orgId: string, memberId: string) => {
    setError("");
    const result = await removeOrgMember(orgId, memberId);
    if (result.error) {
      setError(result.error);
    } else {
      handleExpand(orgId);
      load();
    }
  };

  const handleChangeRole = async (orgId: string, memberId: string, role: OrgRole) => {
    setError("");
    const result = await changeOrgMemberRole(orgId, memberId, role);
    if (result.error) {
      setError(result.error);
    } else {
      handleExpand(orgId);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Organizations</h1>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Create
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-400/60 hover:text-red-400">
            <X className="h-3 w-3 inline" />
          </button>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden">
        {orgs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No organizations yet.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px] w-8"></th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Slug
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Members
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Repos
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Reports
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Last Active
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const isExpanded = expandedId === org.id;
                return (
                  <OrgRow
                    key={org.id}
                    org={org}
                    isExpanded={isExpanded}
                    detail={isExpanded ? detail : null}
                    detailLoading={isExpanded && detailLoading}
                    addMemberOrgId={addMemberOrgId}
                    addMemberEmail={addMemberEmail}
                    addMemberRole={addMemberRole}
                    addingMember={addingMember}
                    onToggle={() => handleExpand(org.id)}
                    onEdit={() => {
                      setEditOrg(org);
                      setEditName(org.name);
                      setEditSlug(org.slug);
                    }}
                    onDelete={() => setDeleteTarget(org)}
                    onStartAddMember={() => {
                      setAddMemberOrgId(org.id);
                      setAddMemberEmail("");
                      setAddMemberRole("member");
                    }}
                    onAddMemberEmailChange={setAddMemberEmail}
                    onAddMemberRoleChange={setAddMemberRole}
                    onAddMember={handleAddMember}
                    onRemoveMember={(memberId) => handleRemoveMember(org.id, memberId)}
                    onChangeRole={(memberId, role) => handleChangeRole(org.id, memberId, role)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Name</label>
              <Input
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  setCreateSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                  );
                }}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Slug</label>
              <Input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                placeholder="acme-corp"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()} size="sm">
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editOrg} onOpenChange={(open) => !open && setEditOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Slug</label>
              <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleEdit} disabled={saving || !editName.trim()} size="sm">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground py-2">
            Are you sure you want to delete <strong className="text-foreground">{deleteTarget?.name}</strong>?
            This will permanently delete all members, repos, policies, reports, and API keys associated with this organization.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrgRow({
  org,
  isExpanded,
  detail,
  detailLoading,
  addMemberOrgId,
  addMemberEmail,
  addMemberRole,
  addingMember,
  onToggle,
  onEdit,
  onDelete,
  onStartAddMember,
  onAddMemberEmailChange,
  onAddMemberRoleChange,
  onAddMember,
  onRemoveMember,
  onChangeRole,
}: {
  org: Org;
  isExpanded: boolean;
  detail: OrgDetailData | null;
  detailLoading: boolean;
  addMemberOrgId: string | null;
  addMemberEmail: string;
  addMemberRole: OrgRole;
  addingMember: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartAddMember: () => void;
  onAddMemberEmailChange: (email: string) => void;
  onAddMemberRoleChange: (role: OrgRole) => void;
  onAddMember: () => void;
  onRemoveMember: (memberId: string) => void;
  onChangeRole: (memberId: string, role: OrgRole) => void;
}) {
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-accent transition-colors">
        <td className="px-4 py-3 cursor-pointer" onClick={onToggle}>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-3 text-[13px] font-medium cursor-pointer" onClick={onToggle}>
          {org.name}
        </td>
        <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground cursor-pointer" onClick={onToggle}>
          {org.slug}
        </td>
        <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground cursor-pointer" onClick={onToggle}>
          {org.members_count}
        </td>
        <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground cursor-pointer" onClick={onToggle}>
          {org.repos_count}
        </td>
        <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground cursor-pointer" onClick={onToggle}>
          {org.reports_count}
        </td>
        <td className="px-4 py-3 text-[13px] text-muted-foreground cursor-pointer" onClick={onToggle}>
          {org.last_report_at
            ? new Date(org.last_report_at).toLocaleDateString()
            : "--"}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b last:border-0">
          <td colSpan={8} className="px-8 py-4 bg-accent/30">
            {detailLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="space-y-4">
                {/* Org info */}
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <span className="text-muted-foreground">ID:</span>{" "}
                    <span className="font-mono text-[12px]">{org.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>{" "}
                    {new Date(org.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Members */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-semibold">
                      Members ({detail.members?.length || 0})
                    </h3>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={onStartAddMember}
                      className="gap-1 h-7 text-[12px]"
                    >
                      <UserPlus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>

                  {/* Add member form */}
                  {addMemberOrgId === org.id && (
                    <div className="flex items-center gap-2 mb-3 p-3 rounded-lg border bg-background">
                      <Input
                        placeholder="Email"
                        value={addMemberEmail}
                        onChange={(e) => onAddMemberEmailChange(e.target.value)}
                        className="flex-1 h-8 text-[12px]"
                        onKeyDown={(e) => e.key === "Enter" && onAddMember()}
                      />
                      <Select
                        value={addMemberRole}
                        onValueChange={(v) => v && onAddMemberRoleChange(v as OrgRole)}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">owner</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="member">member</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8" onClick={onAddMember} disabled={addingMember || !addMemberEmail.trim()}>
                        {addingMember ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  )}

                  {detail.members && detail.members.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full border-collapse">
                        <tbody>
                          {detail.members.map((m: any) => (
                            <tr key={m.id} className="border-b last:border-0">
                              <td className="px-3 py-2 text-[12px]">
                                {m.email}
                              </td>
                              <td className="px-3 py-2 w-[120px]">
                                <Select
                                  value={m.role}
                                  onValueChange={(v) => v && onChangeRole(m.id, v as OrgRole)}
                                >
                                  <SelectTrigger className="w-[100px] h-7 text-[12px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="owner">owner</SelectItem>
                                    <SelectItem value="admin">admin</SelectItem>
                                    <SelectItem value="member">member</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => onRemoveMember(m.id)}
                                  className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">No members</p>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Repos</p>
                    <p className="text-[18px] font-semibold">{detail.repos?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">API Keys</p>
                    <p className="text-[18px] font-semibold">{detail.api_keys?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Reports</p>
                    <p className="text-[18px] font-semibold">{detail.reports?.length || 0}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}
