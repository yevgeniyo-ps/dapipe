"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getDashboardOverview, getReportDetail } from "./actions";
import { Badge } from "@/components/ui/badge";
import {
  GitFork, ShieldCheck, FileBarChart, AlertTriangle, Activity,
  Eye, Shield, Loader2, ChevronDown, ChevronRight, ExternalLink,
  Check, Ban, CircleAlert,
} from "lucide-react";

type Filter = "all" | "clean" | "blocked" | "monitor" | "restrict";

export default function DashboardPage() {
  const orgId = useOrgId();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    repoCount: number;
    reportCount: number;
    blockedCount: number;
    cleanCount: number;
    monitorCount: number;
    restrictCount: number;
    recentReports: any[];
  } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<any>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setData(await getDashboardOverview(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 10000);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(id);
    setExpandLoading(true);
    try {
      const detail = await getReportDetail(id);
      setExpandedData(detail);
    } finally {
      setExpandLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const blockRate = data.reportCount > 0 ? Math.round((data.blockedCount / data.reportCount) * 100) : 0;

  const filtered = (data.recentReports || []).filter((r: any) => {
    if (filter === "clean") return r.blocked_count === 0;
    if (filter === "blocked") return r.blocked_count > 0;
    if (filter === "monitor") return r.mode === "monitor";
    if (filter === "restrict") return r.mode === "restrict";
    return true;
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.reportCount },
    { key: "clean", label: "Clean", count: data.cleanCount },
    { key: "blocked", label: "Blocked", count: data.blockedCount },
    { key: "monitor", label: "Monitor", count: data.monitorCount },
    { key: "restrict", label: "Restrict", count: data.restrictCount },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Repos", value: data.repoCount, icon: GitFork },
          { label: "Total runs", value: data.reportCount, icon: FileBarChart },
          { label: "Clean", value: data.cleanCount, icon: ShieldCheck },
          { label: "Blocked", value: data.blockedCount, icon: AlertTriangle },
          { label: "Block rate", value: `${blockRate}%`, icon: Activity },
          { label: "Restrict", value: data.restrictCount, icon: Shield },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-3.5 w-3.5 text-[#48484a]" />
            </div>
            <div className="text-[26px] font-semibold leading-none">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-[3px] w-fit">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              filter === f.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-[11px] text-muted-foreground">({f.count})</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No reports match this filter.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Pipeline</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Branch</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Mode</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Blocked</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const isExpanded = expandedId === r.id;
                return (
                  <ReportRow
                    key={r.id}
                    report={r}
                    isExpanded={isExpanded}
                    isLoading={isExpanded && expandLoading}
                    detail={isExpanded ? expandedData : null}
                    onToggle={() => toggleExpand(r.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ReportRow({ report: r, isExpanded, isLoading, detail, onToggle }: {
  report: any;
  isExpanded: boolean;
  isLoading: boolean;
  detail: any;
  onToggle: () => void;
}) {
  // Categorize connections
  const conns = detail?.connections || [];
  const allowed = conns.filter((c: any) => c.event === "dns" || (c.event === "connect" && c.domain));
  const blocked = conns.filter((c: any) => c.event === "blocked");

  // Unique targets
  const uniqueAllowed = [...new Set(
    conns.filter((c: any) => c.event !== "blocked")
      .map((c: any) => c.domain)
      .filter((d: string) => d && !d.match(/^app\.dapipe/))
  )] as string[];

  const uniqueBlocked = [...new Set(
    blocked.map((c: any) => c.domain || c.ip).filter(Boolean)
  )] as string[];

  return (
    <>
      <tr
        className="border-b last:border-0 hover:bg-accent cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </td>
        <td className="px-4 py-3">
          <span className="text-[13px] font-medium block">{r.repo_full_name}</span>
          <span className="text-[11px] text-muted-foreground">
            {r.workflow_name || `Run #${r.run_id}`}
            <span className="mx-1">&middot;</span>
            {timeAgo(r.created_at)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-[12px] font-mono text-secondary-foreground">{r.branch}</span>
          <span className="text-[11px] font-mono text-muted-foreground ml-1">{r.commit_sha?.slice(0, 7)}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <Badge variant="secondary" className={r.mode === "restrict" ? "bg-amber-500/15 text-amber-400" : ""}>
            {r.mode === "restrict" ? <Shield className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
            {r.mode}
          </Badge>
        </td>
        <td className="px-4 py-3 text-center text-[13px] tabular-nums">
          {r.blocked_count > 0
            ? <span className="text-destructive font-medium">{r.blocked_count}</span>
            : <span className="text-muted-foreground">0</span>
          }
        </td>
        <td className="px-4 py-3 text-right">
          <Badge variant={r.blocked_count > 0 ? "destructive" : "secondary"}>
            {r.blocked_count > 0 ? "blocked" : "clean"}
          </Badge>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b last:border-0">
          <td colSpan={6} className="px-8 py-4 bg-accent/20">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Meta */}
                <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                  <span>Run #{r.run_id}</span>
                  <span>{r.commit_sha?.slice(0, 7)}</span>
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  {r.run_url && (
                    <a href={r.run_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                      GitHub <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* Targets table */}
                {(uniqueAllowed.length > 0 || uniqueBlocked.length > 0) ? (
                  <table className="w-full border-collapse rounded-lg border overflow-hidden">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Target</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueAllowed.map((t) => (
                        <tr key={`a-${t}`} className="border-b last:border-0">
                          <td className="px-3 py-2 text-[12px] font-mono">{t}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <Check className="h-3 w-3" /> allowed
                            </span>
                          </td>
                        </tr>
                      ))}
                      {uniqueBlocked.map((t) => (
                        <tr key={`b-${t}`} className="border-b last:border-0">
                          <td className="px-3 py-2 text-[12px] font-mono">{t}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-destructive">
                              <Ban className="h-3 w-3" /> blocked
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No connection details available.</p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
