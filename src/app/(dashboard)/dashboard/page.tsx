"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrgId } from "@/components/org-context";
import { getDashboardOverview, getReportDetail, getBaseEndpoints, getPolicy, addToAllowed, addToBlocked } from "./actions";
import { Badge } from "@/components/ui/badge";
import {
  GitFork, ShieldCheck, FileBarChart, AlertTriangle, Activity,
  Eye, Shield, Loader2, ChevronDown, ChevronRight, ExternalLink,
  Check, Ban, Cpu, CircleAlert,
} from "lucide-react";

type Filter = "all" | "clean" | "blocked" | "monitor" | "restrict";

interface Report {
  id: string;
  repo_full_name: string;
  workflow_name: string;
  job_name: string;
  run_id: string;
  run_url: string;
  branch: string;
  commit_sha: string;
  mode: string;
  connection_count: number;
  blocked_count: number;
  status: string;
  created_at: string;
}

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
    recentReports: Report[];
  } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [runLoading, setRunLoading] = useState(false);

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

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleRun = async (id: string) => {
    if (expandedRun === id) { setExpandedRun(null); setRunDetail(null); return; }
    setExpandedRun(id);
    setRunLoading(true);
    try { setRunDetail(await getReportDetail(id)); } finally { setRunLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const blockRate = data.reportCount > 0 ? Math.round((data.blockedCount / data.reportCount) * 100) : 0;

  const filtered = (data.recentReports || []).filter((r) => {
    if (filter === "clean") return r.blocked_count === 0;
    if (filter === "blocked") return r.blocked_count > 0;
    if (filter === "monitor") return r.mode === "monitor";
    if (filter === "restrict") return r.mode === "restrict";
    return true;
  });

  // Group: repo → workflow → run_id → jobs
  const tree: Record<string, Record<string, Record<string, Report[]>>> = {};
  for (const r of filtered) {
    const repo = r.repo_full_name;
    const wf = r.workflow_name || "workflow";
    const runId = r.run_id;
    if (!tree[repo]) tree[repo] = {};
    if (!tree[repo][wf]) tree[repo][wf] = {};
    if (!tree[repo][wf][runId]) tree[repo][wf][runId] = [];
    tree[repo][wf][runId].push(r);
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.reportCount },
    { key: "clean", label: "Clean", count: data.cleanCount },
    { key: "blocked", label: "Blocked", count: data.blockedCount },
    { key: "monitor", label: "Monitor", count: data.monitorCount },
    { key: "restrict", label: "Restrict", count: data.restrictCount },
  ];

  const Chevron = ({ open }: { open: boolean }) =>
    open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;

  const countBlocked = (reports: Report[]) => reports.reduce((sum, r) => sum + r.blocked_count, 0);

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
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {f.label}<span className="ml-1.5 text-[11px] text-muted-foreground">({f.count})</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden divide-y">
        {Object.keys(tree).length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">No reports match this filter.</p>
        ) : Object.entries(tree).map(([repo, workflows]) => {
          const repoKey = repo;
          const repoOpen = expanded.has(repoKey);
          const allRuns = Object.values(workflows).flatMap((jobs) => Object.values(jobs).flat());
          const blocked = countBlocked(allRuns);

          return (
            <div key={repo}>
              {/* ── Repo ── */}
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent cursor-pointer" onClick={() => toggle(repoKey)}>
                <Chevron open={repoOpen} />
                <GitFork className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-[13px] font-semibold flex-1">{repo}</span>
                <span className="text-[12px] text-muted-foreground">{allRuns.length} runs</span>
                {blocked > 0 && <Badge variant="destructive" className="text-[10px]">{blocked} blocked</Badge>}
              </div>

              {repoOpen && Object.entries(workflows).map(([wf, jobs]) => {
                const wfKey = `${repo}/${wf}`;
                const wfOpen = expanded.has(wfKey);
                const wfRuns = Object.values(jobs).flat();
                const wfBlocked = countBlocked(wfRuns);

                return (
                  <div key={wfKey}>
                    {/* ── Workflow ── */}
                    <div className="flex items-center gap-3 pl-10 pr-4 py-2.5 hover:bg-accent cursor-pointer border-t border-border/50" onClick={() => toggle(wfKey)}>
                      <Chevron open={wfOpen} />
                      <FileBarChart className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-medium flex-1">{wf}</span>
                      <span className="text-[11px] text-muted-foreground">{wfRuns.length} runs</span>
                      {wfBlocked > 0 && <Badge variant="destructive" className="text-[10px]">{wfBlocked}</Badge>}
                    </div>

                    {wfOpen && Object.entries(jobs).map(([runId, jobs]) => {
                      const runKey = `${wfKey}/${runId}`;
                      const runOpen = expanded.has(runKey);
                      const runBlocked = countBlocked(jobs);
                      const firstJob = jobs[0];

                      return (
                        <div key={runKey}>
                          {/* ── Run ID ── */}
                          <div className="flex items-center gap-3 pl-16 pr-4 py-2 hover:bg-accent cursor-pointer border-t border-border/40" onClick={() => toggle(runKey)}>
                            <Chevron open={runOpen} />
                            <span className="text-[12px] font-mono text-muted-foreground">#{runId}</span>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(firstJob.created_at)}</span>
                            <div className="flex-1" />
                            <Badge variant="secondary" className={`text-[10px] ${firstJob.mode === "restrict" ? "bg-amber-500/15 text-amber-400" : ""}`}>
                              {firstJob.mode === "restrict" ? <Shield className="h-2.5 w-2.5 mr-0.5" /> : <Eye className="h-2.5 w-2.5 mr-0.5" />}
                              {firstJob.mode}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
                            {runBlocked > 0 && <Badge variant="destructive" className="text-[10px]">{runBlocked} blocked</Badge>}
                            {runBlocked === 0 && jobs.some((j) => j.status === "warning") && (
                              <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/20">new endpoints</Badge>
                            )}
                          </div>

                          {runOpen && jobs.map((r) => {
                            const isJobOpen = expandedRun === r.id;
                            return (
                              <div key={r.id}>
                                {/* ── Job ── */}
                                <div className="flex items-center gap-3 pl-24 pr-4 py-2 hover:bg-accent cursor-pointer border-t border-border/30" onClick={() => toggleRun(r.id)}>
                                  <Chevron open={isJobOpen} />
                                  <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-[12px] font-medium">{r.job_name || "build"}</span>
                                  <div className="flex-1" />
                                  <Badge variant="secondary" className={`text-[10px] ${r.mode === "restrict" ? "bg-amber-500/15 text-amber-400" : ""}`}>
                                    {r.mode === "restrict" ? <Shield className="h-2.5 w-2.5 mr-0.5" /> : <Eye className="h-2.5 w-2.5 mr-0.5" />}
                                    {r.mode}
                                  </Badge>
                                  {r.blocked_count > 0 ? (
                                    <Badge variant="destructive" className="text-[10px]">{r.blocked_count} blocked</Badge>
                                  ) : r.status === "warning" ? (
                                    <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/20">new endpoints</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">clean</Badge>
                                  )}
                                </div>

                                {isJobOpen && (
                                  <div className="pl-28 pr-4 py-3 bg-accent/20 border-t border-border/30">
                                    {runLoading ? (
                                      <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                      <RunDetail report={r} detail={runDetail} />
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunDetail({ report: r, detail }: { report: Report; detail: any }) {
  const orgId = useOrgId();
  const [policy, setPolicy] = useState<any>(null);
  const [base, setBase] = useState<{ allowed: string[]; blocked: string[] }>({ allowed: [], blocked: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([getPolicy(orgId), getBaseEndpoints()]).then(([p, b]) => {
      setPolicy(p);
      setBase(b);
      setLoaded(true);
    });
  }, [orgId]);

  const conns = detail?.connections || [];

  // All policy allowed/blocked
  const allAllowed = new Set([...(base.allowed || []), ...(policy?.allowed_domains || [])]);
  const allBlocked = new Set([...(base.blocked || []), ...(policy?.blocked_domains || []), ...(policy?.blocked_ips || [])]);
  const isBase = (t: string) => base.allowed.includes(t) || base.blocked.includes(t);

  // IPs resolved from domains — use report's resolved_ips if available, fallback to connect heuristic
  const reportResolvedIps = detail?.report?.resolved_ips || [];
  const resolvedIps = new Set(
    reportResolvedIps.length > 0
      ? reportResolvedIps
      : conns.filter((c: any) => c.domain && /^[a-zA-Z]/.test(c.domain) && c.ip).map((c: any) => c.ip)
  );

  // Domains from dns/blocked events + non-blocked connect events with domain
  const domains = [...new Set(
    conns.filter((c: any) => c.domain && !c.domain.match(/^app\.dapipe/))
      .map((c: any) => c.domain)
  )] as string[];

  // Direct IPs: from connect/blocked events where domain is empty
  // Filter out resolved IPs UNLESS they're explicitly in the allowed/blocked policy
  const allDirectIps = Array.from(new Set(
    conns.filter((c: any) => (!c.domain || c.domain === "") && c.ip &&
      (!resolvedIps.has(c.ip) || allAllowed.has(c.ip) || allBlocked.has(c.ip)))
      .map((c: any) => c.ip)
  )) as string[];

  // Merge all targets
  const allTargets: string[] = [...domains, ...allDirectIps];

  // Blocked targets (from blocked events only)
  const blockedSet = new Set(
    conns.filter((c: any) => c.event === "blocked").map((c: any) => c.domain || c.ip).filter(Boolean)
  );

  // Categorize
  type Category = "allowed" | "blocked_existing" | "blocked_new" | "new";
  const targets: { target: string; category: Category }[] = [];

  for (const t of allTargets) {
    const isBlocked = blockedSet.has(t);

    if (allAllowed.has(t) && !isBlocked) {
      targets.push({ target: t, category: "allowed" });
    } else if (allBlocked.has(t)) {
      targets.push({ target: t, category: "blocked_existing" });
    } else if (isBlocked) {
      targets.push({ target: t, category: "blocked_new" });
    } else {
      targets.push({ target: t, category: "new" });
    }
  }

  const handleAllow = async (target: string) => {
    if (!orgId) return;
    await addToAllowed(orgId, target);
  };

  const handleBlock = async (target: string) => {
    if (!orgId) return;
    await addToBlocked(orgId, target);
  };

  const statusLabel = (cat: Category) => {
    switch (cat) {
      case "allowed": return <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Check className="h-3 w-3" /> allowed</span>;
      case "blocked_existing": return <span className="inline-flex items-center gap-1.5 text-[12px] text-destructive"><Ban className="h-3 w-3" /> blocked</span>;
      case "blocked_new": return <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-400"><CircleAlert className="h-3 w-3" /> blocked (new)</span>;
      case "new": return <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-400"><CircleAlert className="h-3 w-3" /> new</span>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>Run #{r.run_id}</span>
        <span>{new Date(r.created_at).toLocaleString()}</span>
        {r.run_url && (
          <a href={r.run_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            GitHub <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : targets.length > 0 ? (
        <table className="w-full border-collapse rounded-lg border overflow-hidden">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Target</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {targets.map(({ target, category }) => (
              <tr key={target} className="border-b last:border-0">
                <td className="px-3 py-2 text-[12px] font-mono">{target}</td>
                <td className="px-3 py-2">{statusLabel(category)}</td>
                <td className="px-3 py-2 text-right">
                  {(category === "new" || category === "blocked_new") && loaded && !isBase(target) && (
                    <div className="inline-flex gap-1">
                      <button onClick={() => handleAllow(target)} className="rounded px-2 py-0.5 text-[11px] border hover:bg-accent">Allow</button>
                      <button onClick={() => handleBlock(target)} className="rounded px-2 py-0.5 text-[11px] border border-destructive/30 text-destructive hover:bg-destructive/10">Block</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12px] text-muted-foreground">No connection details available.</p>
      )}
    </div>
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
