"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useParams } from "next/navigation";
import { getRepoDetail } from "../../actions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repo, setRepo] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getRepoDetail(id);
      if (!data) { setNotFound(true); return; }
      setRepo(data.repo);
      setPolicy(data.policy);
      setReports(data.reports);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (notFound || !repo) return <p className="text-[13px] text-muted-foreground py-12 text-center">Repo not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">{repo.full_name}</h1>
        <Badge variant={repo.is_active ? "secondary" : "outline"}>{repo.is_active ? "active" : "inactive"}</Badge>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground mb-2">Policy</h2>
        <p className="text-[13px] text-secondary-foreground">
          {policy ? `Repo-specific policy in ${policy.mode} mode` : "Using org-wide policy (no repo override)"}
        </p>
        {policy && (
          <div className="mt-3 space-y-1.5 text-[13px]">
            <div><span className="text-muted-foreground">Mode:</span> <Badge variant="outline">{policy.mode}</Badge></div>
            {policy.allowed_domains.length > 0 && <div><span className="text-muted-foreground">Allowed:</span> <span className="font-mono text-[12px]">{policy.allowed_domains.join(", ")}</span></div>}
            {policy.blocked_domains.length > 0 && <div><span className="text-muted-foreground">Blocked:</span> <span className="font-mono text-[12px]">{policy.blocked_domains.join(", ")}</span></div>}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-[14px] font-semibold mb-3">Recent reports</h2>
        <div className="rounded-2xl border overflow-hidden">
          {!reports || reports.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-12 text-center">No reports yet for this repo.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Run</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Branch</th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Date</th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b last:border-0 hover:bg-accent transition-colors">
                    <td className="px-4 py-3"><Link href={`/dashboard/reports/${report.id}`} className="text-[14px] font-medium hover:underline">#{report.run_id}</Link></td>
                    <td className="px-4 py-3 text-[13px] font-mono text-secondary-foreground">{report.branch} <span className="text-muted-foreground">{report.commit_sha?.slice(0, 7)}</span></td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{new Date(report.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right"><Badge variant={report.blocked_count > 0 ? "destructive" : "secondary"}>{report.blocked_count > 0 ? `${report.blocked_count} blocked` : "clean"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
