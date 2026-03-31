"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrg } from "@/components/org-context";
import { getReports } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function ReportsPage() {
  const { orgId } = useOrg();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setReports(await getReports(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Reports</h1>

      <div className="rounded-2xl border overflow-hidden">
        {!reports || reports.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No reports yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Pipeline</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Branch</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Mode</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Conn</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/reports/${r.id}`} className="block hover:underline">
                      <span className="text-[13px] font-medium block">{r.repo_full_name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {r.workflow_name || `Run #${r.run_id}`}
                        <span className="mx-1">&middot;</span>
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-mono text-secondary-foreground">{r.branch}</span>
                    <span className="text-[11px] font-mono text-muted-foreground ml-1">{r.commit_sha?.slice(0, 7)}</span>
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline">{r.mode}</Badge></td>
                  <td className="px-4 py-3 text-center text-[13px] text-secondary-foreground">{r.connection_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={r.blocked_count > 0 ? "destructive" : "secondary"}>
                      {r.blocked_count > 0 ? `${r.blocked_count} blocked` : "clean"}
                    </Badge>
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
