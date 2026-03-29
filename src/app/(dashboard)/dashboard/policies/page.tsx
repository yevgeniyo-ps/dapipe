"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getPolicy, savePolicy, getBaseEndpoints } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Plus, X, Lock } from "lucide-react";
import type { PolicyMode } from "@/lib/types/database";

export default function PoliciesPage() {
  const orgId = useOrgId();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [mode, setMode] = useState<PolicyMode>("monitor");
  const [baseAllowed, setBaseAllowed] = useState<string[]>([]);
  const [baseBlocked, setBaseBlocked] = useState<string[]>([]);
  const [customerAllowed, setCustomerAllowed] = useState<string[]>([]);
  const [customerBlocked, setCustomerBlocked] = useState<string[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [newAllowed, setNewAllowed] = useState("");
  const [newBlocked, setNewBlocked] = useState("");
  const [newIp, setNewIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      const [policy, base] = await Promise.all([
        getPolicy(orgId),
        getBaseEndpoints(),
      ]);
      setBaseAllowed(base.allowed);
      setBaseBlocked(base.blocked);
      if (policy) {
        setPolicyId(policy.id);
        setMode(policy.mode as PolicyMode);
        setCustomerAllowed(policy.allowed_domains || []);
        setCustomerBlocked(policy.blocked_domains || []);
        setBlockedIps(policy.blocked_ips || []);
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
      allowed_domains: customerAllowed,
      blocked_domains: customerBlocked,
      blocked_ips: blockedIps,
    });
    setSaving(false);
  };

  const addDomain = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    list: string[],
    listSetter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const domain = value.trim().toLowerCase();
    if (!domain) return;
    if (!list.includes(domain) && !baseAllowed.includes(domain) && !baseBlocked.includes(domain)) {
      listSetter([...list, domain]);
    }
    setter("");
  };

  const removeDomain = (
    domain: string,
    list: string[],
    listSetter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    listSetter(list.filter((d) => d !== domain));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Network Rules</h1>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>

      {/* Mode */}
      <div className="rounded-2xl border p-5">
        <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Mode</label>
        <p className="text-[13px] text-muted-foreground mt-1 mb-3">Monitor warns on new domains. Restrict blocks everything not in the allowed list.</p>
        <div className="flex items-center gap-3">
          <select value={mode} onChange={(e) => setMode(e.target.value as PolicyMode)}
            className="h-9 w-48 rounded-md border bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/30">
            <option value="monitor">monitor — Warn only</option>
            <option value="restrict">restrict — Block unknown</option>
          </select>
          <Badge variant={mode === "restrict" ? "destructive" : "secondary"}>{mode}</Badge>
        </div>
      </div>

      {/* Allowed domains */}
      <div className="rounded-2xl border p-5">
        <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Allowed domains</label>
        <p className="text-[13px] text-muted-foreground mt-1 mb-3">Domains permitted in restrict mode. Base domains are managed globally.</p>

        <div className="space-y-1.5 mb-3">
          {/* Base domains (greyed out, locked) */}
          {baseAllowed.map((d) => (
            <div key={`base-${d}`} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[13px] font-mono text-muted-foreground flex-1">{d}</span>
              <Badge variant="secondary" className="text-[10px]">base</Badge>
            </div>
          ))}
          {/* Customer domains (editable) */}
          {customerAllowed.map((d) => (
            <div key={`custom-${d}`} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <span className="text-[13px] font-mono flex-1">{d}</span>
              <button onClick={() => removeDomain(d, customerAllowed, setCustomerAllowed)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="registry.npmjs.org"
            value={newAllowed}
            onChange={(e) => setNewAllowed(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain(newAllowed, setNewAllowed, customerAllowed, setCustomerAllowed)}
            className="flex-1 font-mono text-[13px]"
          />
          <Button size="sm" variant="secondary" onClick={() => addDomain(newAllowed, setNewAllowed, customerAllowed, setCustomerAllowed)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Blocked domains */}
      <div className="rounded-2xl border p-5">
        <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Blocked domains</label>
        <p className="text-[13px] text-muted-foreground mt-1 mb-3">Always blocked regardless of mode. Threat intel domains are managed globally.</p>

        <div className="space-y-1.5 mb-3">
          {baseBlocked.map((d) => (
            <div key={`base-${d}`} className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5">
              <Lock className="h-3 w-3 text-destructive/50 shrink-0" />
              <span className="text-[13px] font-mono text-destructive/70 flex-1">{d}</span>
              <Badge variant="destructive" className="text-[10px]">threat intel</Badge>
            </div>
          ))}
          {customerBlocked.map((d) => (
            <div key={`custom-${d}`} className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-1.5">
              <span className="text-[13px] font-mono flex-1">{d}</span>
              <button onClick={() => removeDomain(d, customerBlocked, setCustomerBlocked)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="evil.example.com"
            value={newBlocked}
            onChange={(e) => setNewBlocked(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain(newBlocked, setNewBlocked, customerBlocked, setCustomerBlocked)}
            className="flex-1 font-mono text-[13px]"
          />
          <Button size="sm" variant="secondary" onClick={() => addDomain(newBlocked, setNewBlocked, customerBlocked, setCustomerBlocked)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Blocked IPs */}
      <div className="rounded-2xl border p-5">
        <label className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">Blocked IPs</label>
        <p className="text-[13px] text-muted-foreground mt-1 mb-3">Always blocked regardless of mode.</p>

        <div className="space-y-1.5 mb-3">
          {blockedIps.map((ip) => (
            <div key={ip} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <span className="text-[13px] font-mono flex-1">{ip}</span>
              <button onClick={() => removeDomain(ip, blockedIps, setBlockedIps)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="1.2.3.4"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain(newIp, setNewIp, blockedIps, setBlockedIps)}
            className="flex-1 font-mono text-[13px]"
          />
          <Button size="sm" variant="secondary" onClick={() => addDomain(newIp, setNewIp, blockedIps, setBlockedIps)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
