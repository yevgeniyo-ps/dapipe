"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getPolicy, savePolicy } from "../actions";
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

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      const data = await getPolicy(orgId);
      if (data) {
        setPolicyId(data.id);
        setMode(data.mode as PolicyMode);
        setAllowedDomains(data.allowed_domains.join("\n"));
        setBlockedDomains(data.blocked_domains.join("\n"));
        setBlockedIps(data.blocked_ips.join("\n"));
      }
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

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

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Policy</h1>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border p-5">
          <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Mode</label>
          <p className="text-[13px] text-muted-foreground mt-1 mb-3">Monitor warns on new domains. Restrict blocks unknown.</p>
          <div className="flex items-center gap-3">
            <select value={mode} onChange={(e) => setMode(e.target.value as PolicyMode)}
              className="h-9 w-48 rounded-md border bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/30">
              <option value="monitor">monitor — Warn only</option>
              <option value="restrict">restrict — Block unknown</option>
            </select>
            <Badge variant={mode === "restrict" ? "destructive" : "secondary"}>{mode}</Badge>
          </div>
        </div>

        {[
          { label: "Allowed domains", desc: "One per line. Permitted in restrict mode.", value: allowedDomains, set: setAllowedDomains, ph: "github.com\nregistry.npmjs.org", h: "120px" },
          { label: "Blocked domains", desc: "Always blocked regardless of mode.", value: blockedDomains, set: setBlockedDomains, ph: "evil.com\nbad-c2.example", h: "80px" },
          { label: "Blocked IPs", desc: "Always blocked regardless of mode.", value: blockedIps, set: setBlockedIps, ph: "1.2.3.4\n10.0.0.1", h: "80px" },
        ].map((f) => (
          <div key={f.label} className="rounded-2xl border p-5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">{f.label}</label>
            <p className="text-[13px] text-muted-foreground mt-1 mb-3">{f.desc}</p>
            <textarea
              className={`w-full rounded-md border bg-input px-3 py-2 text-[14px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-ring/30 resize-y`}
              style={{ minHeight: f.h }}
              placeholder={f.ph}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
