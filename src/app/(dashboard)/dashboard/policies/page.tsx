"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrg } from "@/components/org-context";
import { getPolicy, savePolicy, getBaseEndpoints } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Plus, Trash2, Lock } from "lucide-react";

export default function PoliciesPage() {
  const { orgId, permissions } = useOrg();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [baseAllowed, setBaseAllowed] = useState<string[]>([]);
  const [baseBlocked, setBaseBlocked] = useState<string[]>([]);
  const [customerAllowed, setCustomerAllowed] = useState<string[]>([]);
  const [customerBlocked, setCustomerBlocked] = useState<string[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"allowed" | "blocked">("allowed");
  const [newEntry, setNewEntry] = useState("");
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
      mode: "restrict",
      allowed_domains: customerAllowed,
      blocked_domains: customerBlocked,
      blocked_ips: blockedIps,
    });
    setSaving(false);
  };

  const handleAdd = () => {
    const value = newEntry.trim().toLowerCase();
    if (!value) return;
    if (activeTab === "allowed") {
      if (!customerAllowed.includes(value) && !baseAllowed.includes(value)) {
        setCustomerAllowed([...customerAllowed, value]);
      }
    } else {
      // Detect IP vs domain
      const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
      if (isIp) {
        if (!blockedIps.includes(value)) {
          setBlockedIps([...blockedIps, value]);
        }
      } else {
        if (!customerBlocked.includes(value) && !baseBlocked.includes(value)) {
          setCustomerBlocked([...customerBlocked, value]);
        }
      }
    }
    setNewEntry("");
  };

  const handleRemove = (value: string, type: "allowed" | "blocked-domain" | "blocked-ip") => {
    if (type === "allowed") setCustomerAllowed(customerAllowed.filter((d) => d !== value));
    else if (type === "blocked-domain") setCustomerBlocked(customerBlocked.filter((d) => d !== value));
    else setBlockedIps(blockedIps.filter((ip) => ip !== value));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const allowedTotal = baseAllowed.length + customerAllowed.length;
  const blockedTotal = baseBlocked.length + customerBlocked.length + blockedIps.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Egress Rules</h1>
        {permissions.canManageResources && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit">
        {([
          { key: "allowed" as const, label: "Allowed", count: allowedTotal },
          { key: "blocked" as const, label: "Blocked", count: blockedTotal },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[11px] text-muted-foreground">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {permissions.canManageResources && (
        <div className="rounded-2xl border p-5 space-y-4">
          <h3 className="text-[14px] font-semibold">
            Add {activeTab === "allowed" ? "allowed" : "blocked"} endpoint
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {activeTab === "allowed"
              ? "Domains permitted in restrict mode. Enter one domain per entry."
              : "Domains or IPs to always block. IPs are auto-detected (e.g. 1.2.3.4)."}
          </p>
          <div className="flex gap-3">
            <Input
              placeholder={activeTab === "allowed" ? "registry.npmjs.org" : "evil.com or 1.2.3.4"}
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1 font-mono text-[13px]"
            />
            <Button onClick={handleAdd} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        {activeTab === "allowed" ? (
          allowedTotal === 0 ? (
            <p className="text-[13px] text-muted-foreground py-12 text-center">No allowed endpoints.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Domain</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Source</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {baseAllowed.map((d) => (
                  <tr key={`base-${d}`} className="border-b last:border-0 bg-muted/30">
                    <td className="px-4 py-3 text-[13px] font-mono text-muted-foreground flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0 inline" /> {d}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Global base</td>
                    <td className="px-4 py-3 text-right text-[12px] text-muted-foreground">--</td>
                  </tr>
                ))}
                {customerAllowed.map((d) => (
                  <tr key={`custom-${d}`} className="border-b last:border-0">
                    <td className="px-4 py-3 text-[13px] font-mono font-medium">{d}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Custom</td>
                    <td className="px-4 py-3 text-right">
                      {permissions.canManageResources && (
                        <Button variant="destructive" size="sm" onClick={() => handleRemove(d, "allowed")}>
                          <Trash2 className="mr-1 h-3 w-3" /> Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          blockedTotal === 0 ? (
            <p className="text-[13px] text-muted-foreground py-12 text-center">No blocked endpoints.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Target</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Type</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Source</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {baseBlocked.map((d) => (
                  <tr key={`base-${d}`} className="border-b last:border-0 bg-destructive/5">
                    <td className="px-4 py-3 text-[13px] font-mono text-muted-foreground">
                      <Lock className="h-3 w-3 text-destructive/50 shrink-0 inline mr-2" />{d}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Domain</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Threat intel</td>
                    <td className="px-4 py-3 text-right text-[12px] text-muted-foreground">--</td>
                  </tr>
                ))}
                {customerBlocked.map((d) => (
                  <tr key={`custom-${d}`} className="border-b last:border-0">
                    <td className="px-4 py-3 text-[13px] font-mono font-medium">{d}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Domain</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Custom</td>
                    <td className="px-4 py-3 text-right">
                      {permissions.canManageResources && (
                        <Button variant="destructive" size="sm" onClick={() => handleRemove(d, "blocked-domain")}>
                          <Trash2 className="mr-1 h-3 w-3" /> Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {blockedIps.map((ip) => (
                  <tr key={`ip-${ip}`} className="border-b last:border-0">
                    <td className="px-4 py-3 text-[13px] font-mono font-medium">{ip}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">IP</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">Custom</td>
                    <td className="px-4 py-3 text-right">
                      {permissions.canManageResources && (
                        <Button variant="destructive" size="sm" onClick={() => handleRemove(ip, "blocked-ip")}>
                          <Trash2 className="mr-1 h-3 w-3" /> Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
