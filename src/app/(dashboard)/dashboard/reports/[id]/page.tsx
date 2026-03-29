"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useParams } from "next/navigation";
import { getReportDetail } from "../../actions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<any>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getReportDetail(id);
      if (!data) { setNotFound(true); return; }
      setReport(data.report);
      setConnections(data.connections);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (notFound || !report) return <p className="text-[13px] text-muted-foreground py-12 text-center">Report not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-semibold">{report.repo_full_name}</h1>
          <Badge variant={report.blocked_count > 0 ? "destructive" : "secondary"}>{report.status}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {report.workflow_name && <>{report.workflow_name} &middot; </>}
          Run #{report.run_id} &middot; {report.branch} &middot; {report.commit_sha?.slice(0, 7)} &middot;{" "}
          {new Date(report.created_at).toLocaleString()}
          {report.run_url && (
            <> &middot; <Link href={report.run_url} target="_blank" className="underline underline-offset-4 hover:text-foreground">GitHub</Link></>
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Mode", value: report.mode },
          { label: "Connections", value: report.connection_count },
          { label: "Blocked", value: report.blocked_count },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border p-4">
            <span className="text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">{m.label}</span>
            <div className="mt-2 text-[28px] font-semibold leading-none">{m.value}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-[14px] font-semibold mb-3">Connections</h2>
        <div className="rounded-2xl border overflow-hidden">
          {!connections || connections.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-12 text-center">No connection data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    {["Event", "Domain", "IP", "Port", "Process", "PID", "Time"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn) => (
                    <tr key={conn.id} className="border-b last:border-0 hover:bg-accent transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant={conn.event === "blocked" ? "destructive" : "secondary"}>{conn.event}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px]">{conn.domain || "-"}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{conn.ip || "-"}</td>
                      <td className="px-4 py-3 text-[13px]">{conn.port}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{conn.process || "-"}</td>
                      <td className="px-4 py-3 text-[13px]">{conn.pid}</td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">{new Date(conn.ts).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
