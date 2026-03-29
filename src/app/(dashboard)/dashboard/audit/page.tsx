"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getAuditLog } from "../actions";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  action: string;
  target: string;
  details: Record<string, string>;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; variant: "secondary" | "destructive" | "default" }> = {
  add_to_allowed: { label: "Allowed", variant: "secondary" },
  add_to_blocked: { label: "Blocked", variant: "destructive" },
};

export default function AuditPage() {
  const orgId = useOrgId();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setEntries((await getAuditLog(orgId)) as AuditEntry[]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Audit Log</h1>

      <div className="rounded-2xl border overflow-hidden">
        {entries.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No audit entries yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Time</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Action</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Target</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Source</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const config = ACTION_LABELS[e.action] || { label: e.action, variant: "secondary" as const };
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono">{e.target}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{e.details?.source || "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
