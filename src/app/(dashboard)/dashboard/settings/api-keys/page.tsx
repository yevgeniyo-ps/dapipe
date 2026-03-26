"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Key, Plus, Copy, Loader2 } from "lucide-react";
import type { ApiKey } from "@/lib/types/database";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) return;
    setOrgId(membership.org_id);

    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("org_id", membership.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    setKeys(data || []);
    setLoading(false);
  }

  const handleCreate = async () => {
    if (!orgId) return;
    setCreating(true);

    // Generate a random key
    const rawKey = `dp_${crypto.randomUUID().replace(/-/g, "")}`;
    const prefix = rawKey.slice(0, 10) + "...";

    // Hash it client-side
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const supabase = createClient();
    await supabase.from("api_keys").insert({
      org_id: orgId,
      key_hash: keyHash,
      key_prefix: prefix,
      name: newKeyName,
    });

    setNewKeyValue(rawKey);
    setCreating(false);
    await loadKeys();
  };

  const handleRevoke = async (keyId: string) => {
    const supabase = createClient();
    await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId);
    await loadKeys();
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
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setNewKeyValue(null);
              setNewKeyName("Default");
            }
          }}
        >
          <DialogTrigger>
            <Plus className="mr-2 h-4 w-4" />
            Create key
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {newKeyValue ? "Key created" : "Create API key"}
              </DialogTitle>
              <DialogDescription>
                {newKeyValue
                  ? "Copy this key now. You won't be able to see it again."
                  : "This key authenticates the DaPipe GitHub Action."}
              </DialogDescription>
            </DialogHeader>

            {newKeyValue ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                  <code className="flex-1 text-sm break-all">
                    {newKeyValue}
                  </code>
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
              <>
                <Input
                  placeholder="Key name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Create
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

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
