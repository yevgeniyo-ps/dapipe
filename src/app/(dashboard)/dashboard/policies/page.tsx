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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import type { Policy, PolicyMode } from "@/lib/types/database";

export default function PoliciesPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [mode, setMode] = useState<PolicyMode>("monitor");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [blockedDomains, setBlockedDomains] = useState("");
  const [blockedIps, setBlockedIps] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
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

      // Load org-wide policy (repo_id is null)
      const { data } = await supabase
        .from("policies")
        .select("*")
        .eq("org_id", membership.org_id)
        .is("repo_id", null)
        .limit(1)
        .single();

      if (data) {
        setPolicy(data);
        setMode(data.mode as PolicyMode);
        setAllowedDomains(data.allowed_domains.join("\n"));
        setBlockedDomains(data.blocked_domains.join("\n"));
        setBlockedIps(data.blocked_ips.join("\n"));
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      org_id: orgId,
      repo_id: null,
      mode,
      allowed_domains: allowedDomains
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean),
      blocked_domains: blockedDomains
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean),
      blocked_ips: blockedIps
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean),
    };

    if (policy) {
      await supabase.from("policies").update(payload).eq("id", policy.id);
    } else {
      await supabase.from("policies").insert(payload);
    }

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
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as PolicyMode)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monitor">
                <Badge variant="secondary" className="mr-2">
                  monitor
                </Badge>
                Warn only
              </SelectItem>
              <SelectItem value="restrict">
                <Badge variant="destructive" className="mr-2">
                  restrict
                </Badge>
                Block unknown
              </SelectItem>
            </SelectContent>
          </Select>
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
          <Input
            placeholder="1.2.3.4"
            value={blockedIps}
            onChange={(e) => setBlockedIps(e.target.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
