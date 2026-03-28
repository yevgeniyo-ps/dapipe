"use client";

import { useEffect, useState } from "react";
import { useOrgId } from "@/components/org-context";
import { createApiKey, revokeApiKey, getApiKeys } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Plus, Copy, Loader2, X } from "lucide-react";
import type { ApiKey } from "@/lib/types/database";

export default function ApiKeysPage() {
  const orgId = useOrgId();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!orgId) { setLoading(false); return; } loadKeys(orgId); }, [orgId]);

  async function loadKeys(oid: string) { try { setKeys(await getApiKeys(oid) as ApiKey[]); } finally { setLoading(false); } }

  const handleCreate = async () => {
    if (!orgId) { setError("No organization found"); return; }
    setCreating(true); setError(null);
    try {
      const result = await createApiKey(orgId, newKeyName);
      if (result.error) { setError(result.error); setCreating(false); return; }
      setNewKeyValue(result.key);
      await loadKeys(orgId);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setCreating(false); }
  };

  const handleRevoke = async (keyId: string) => { if (!orgId) return; await revokeApiKey(keyId); await loadKeys(orgId); };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">API Keys</h1>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus className="mr-2 h-4 w-4" /> New key</Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</div>}

      {showCreate && (
        <div className="rounded-2xl border p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[14px] font-semibold">{newKeyValue ? "Key created" : "Create API key"}</h3>
            <button onClick={() => { setShowCreate(false); setNewKeyValue(null); setNewKeyName("Default"); setError(null); }} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-[13px] text-muted-foreground mb-4">{newKeyValue ? "Copy now — you won't see it again." : "Authenticates the GitHub Action."}</p>
          {newKeyValue ? (
            <div>
              <div className="flex items-center gap-2 rounded-md border bg-input px-3 py-2.5">
                <code className="flex-1 text-[12px] font-mono break-all">{newKeyValue}</code>
                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(newKeyValue)} className="shrink-0 h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Add as <code className="font-mono">DAPIPE_API_KEY</code> in repo secrets.</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Input placeholder="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="flex-1" />
              <Button onClick={handleCreate} disabled={creating} size="sm">{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden">
        {keys.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No API keys yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Key</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Prefix</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Last used</th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-[14px] font-medium">{key.name}</td>
                  <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground">{key.key_prefix}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right"><Button variant="destructive" size="sm" onClick={() => handleRevoke(key.id)}>Revoke</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
