"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, UserCog } from "lucide-react";
import { listAdmins, addAdmin, removeAdmin } from "../actions";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    try {
      const result = await listAdmins();
      setAdmins((result.admins || []) as AdminUser[]);
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = async () => {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const result = await addAdmin(email.trim(), name.trim() || undefined);
      if (result?.error) {
        setError(result.error);
      } else {
        setEmail("");
        setName("");
        await loadAdmins();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (admins.length <= 1) return;
    if (!confirm("Remove this admin?")) return;
    await removeAdmin(id);
    await loadAdmins();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <UserCog className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[20px] font-semibold">Admin Users</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Add form */}
      <div className="rounded-2xl border p-5 space-y-4">
        <h3 className="text-[14px] font-semibold">Add admin</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Email
            </label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="w-[200px]">
            <label className="text-[13px] font-medium text-secondary-foreground mb-2 block">
              Name
            </label>
            <Input
              placeholder="optional"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={adding} size="sm">
            {adding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        {admins.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No admin users configured.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Added
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium">
                    {admin.email}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {admin.name || "--"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {new Date(admin.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(admin.id)}
                      disabled={admins.length <= 1}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
