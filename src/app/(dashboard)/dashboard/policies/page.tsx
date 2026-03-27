"use client";

import { useEffect, useState } from "react";
import { useOrgId } from "@/components/org-context";
import { getPolicy, savePolicy } from "../actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import type { PolicyMode } from "@/lib/types/database";

export default function PoliciesPage() {
  const orgId = useOrgId();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [mode, setMode] = useState<PolicyMode>("monitor");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [blockedDomains, setBlockedDomains] = useState("");
  const [blockedIps, setBlockedIps] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    async function load() {
      try {
        const data = await getPolicy(orgId!);
        if (data) {
          setPolicyId(data.id);
          setMode(data.mode as PolicyMode);
          setAllowedDomains(data.allowed_domains.join("\n"));
          setBlockedDomains(data.blocked_domains.join("\n"));
          setBlockedIps(data.blocked_ips.join("\n"));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);

    await savePolicy(orgId, policyId, {
      mode,
      allowed_domains: allowedDomains.split("\n").map((d) => d.trim()).filter(Boolean),
      blocked_domains: blockedDomains.split("\n").map((d) => d.trim()).filter(Boolean),
      blocked_ips: blockedIps.split("\n").map((d) => d.trim()).filter(Boolean),
    });

    setSaving(false);
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
        <h1 className="text-2xl font-bold">Org-wide Policy</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save policy
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mode</CardTitle>
          <CardDescription>
            Monitor mode warns on new domains. Restrict mode blocks anything not
            in the allowed list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PolicyMode)}
              className="h-8 w-48 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              <option value="monitor">monitor — Warn only</option>
              <option value="restrict">restrict — Block unknown</option>
            </select>
            <Badge variant={mode === "restrict" ? "destructive" : "secondary"}>
              {mode}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed domains</CardTitle>
          <CardDescription>
            One domain per line. These domains are permitted in restrict mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            placeholder={"github.com\nregistry.npmjs.org\napi.github.com"}
            value={allowedDomains}
            onChange={(e) => setAllowedDomains(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked domains</CardTitle>
          <CardDescription>
            One domain per line. Always blocked regardless of mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            placeholder={"evil.com\nbad-c2.example"}
            value={blockedDomains}
            onChange={(e) => setBlockedDomains(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked IPs</CardTitle>
          <CardDescription>
            One IP per line. Always blocked regardless of mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            placeholder={"1.2.3.4\n10.0.0.1"}
            value={blockedIps}
            onChange={(e) => setBlockedIps(e.target.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
