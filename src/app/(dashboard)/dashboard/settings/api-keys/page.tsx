"use client";

import { useEffect, useState } from "react";
import { useOrgId } from "@/components/org-context";
import { createApiKey, revokeApiKey, getApiKeys } from "../../actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    loadKeys(orgId);
  }, [orgId]);

  async function loadKeys(oid: string) {
    try {
      const data = await getApiKeys(oid);
      setKeys(data as ApiKey[]);
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = async () => {
    if (!orgId) {
      setError("No organization found — try refreshing the page");
      return;
    }
    setCreating(true);
    setError(null);

    try {
      const result = await createApiKey(orgId, newKeyName);

      if (result.error) {
        setError(result.error);
        setCreating(false);
        return;
      }

      setNewKeyValue(result.key);
      await loadKeys(orgId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!orgId) return;
    await revokeApiKey(keyId);
    await loadKeys(orgId);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create key
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showCreate && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {newKeyValue ? "Key created" : "Create API key"}
              </CardTitle>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewKeyValue(null);
                  setNewKeyName("Default");
                  setError(null);
                }}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardDescription>
              {newKeyValue
                ? "Copy this key now. You won't be able to see it again."
                : "This key authenticates the DaPipe GitHub Action."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {newKeyValue ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                  <code className="flex-1 text-sm break-all">{newKeyValue}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(newKeyValue)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this as <code>DAPIPE_API_KEY</code> in your repo secrets.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Key name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Create
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active keys</CardTitle>
          <CardDescription>
            API keys authenticate the DaPipe GitHub Action with your
            organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No API keys yet. Create one to connect the GitHub Action.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{key.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {key.key_prefix}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.last_used_at && (
                      <span className="text-xs text-muted-foreground">
                        Last used{" "}
                        {new Date(key.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevoke(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
