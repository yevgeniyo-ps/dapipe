import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { GitFork, ShieldCheck, FileBarChart, AlertTriangle, Activity, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("org_members").select("org_id").eq("user_id", user!.id).limit(1).maybeSingle();
  const orgId = membership?.org_id;

  const [reposRes, reportsRes, blockedRes, cleanRes] = await Promise.all([
    supabase.from("repos").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).gt("blocked_count", 0),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("blocked_count", 0),
  ]);

  const { data: recentReports } = await supabase
    .from("reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(8);

  const { data: recentBlocked } = await supabase
    .from("reports").select("*").eq("org_id", orgId).gt("blocked_count", 0).order("created_at", { ascending: false }).limit(5);

  const repoCount = reposRes.count || 0;
  const reportCount = reportsRes.count || 0;
  const blockedCount = blockedRes.count || 0;
  const cleanCount = cleanRes.count || 0;
  const blockRate = reportCount > 0 ? Math.round((blockedCount / reportCount) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${repoCount > 0 ? "bg-emerald-500" : "bg-[#48484a]"}`} />
          <span className="text-[12px] text-muted-foreground">{repoCount > 0 ? "Protected" : "No repos"}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Repos", value: repoCount, icon: GitFork },
          { label: "Total runs", value: reportCount, icon: FileBarChart },
          { label: "Clean", value: cleanCount, icon: ShieldCheck },
          { label: "Blocked", value: blockedCount, icon: AlertTriangle },
          { label: "Block rate", value: `${blockRate}%`, icon: Activity },
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent runs — 2/3 width */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold">Recent runs</h2>
            <Link href="/dashboard/reports" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              All reports <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-2xl border overflow-hidden">
            {!recentReports || recentReports.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-12 text-center">No reports yet.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Pipeline</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Branch</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Conn</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReports.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-accent">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/reports/${r.id}`} className="block hover:underline">
                          <span className="text-[13px] font-medium block">{r.repo_full_name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {r.workflow_name || `Run #${r.run_id}`}
                            <span className="mx-1">&middot;</span>
                            {timeAgo(r.created_at)}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-mono text-secondary-foreground">{r.branch}</span>
                        <span className="text-[11px] font-mono text-muted-foreground ml-1">{r.commit_sha?.slice(0, 7)}</span>
                      </td>
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

        {/* Sidebar panel — 1/3 width */}
        <div className="space-y-6">
          {/* Threats */}
          <div>
            <h2 className="text-[14px] font-semibold mb-3">Recent threats</h2>
            <div className="rounded-2xl border overflow-hidden">
              {!recentBlocked || recentBlocked.length === 0 ? (
                <div className="p-4 text-center">
                  <ShieldCheck className="mx-auto h-5 w-5 text-[#48484a] mb-2" />
                  <p className="text-[12px] text-muted-foreground">No blocked connections</p>
                </div>
              ) : (
                <div className="divide-y">
                  {recentBlocked.map((r) => (
                    <Link key={r.id} href={`/dashboard/reports/${r.id}`} className="block px-4 py-3 hover:bg-accent">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium">{r.repo_full_name.split("/")[1]}</span>
                        <span className="text-[11px] font-semibold text-destructive">{r.blocked_count} blocked</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {r.workflow_name || `Run #${r.run_id}`}
                        <span className="mx-1">&middot;</span>
                        {timeAgo(r.created_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mode breakdown */}
          <div>
            <h2 className="text-[14px] font-semibold mb-3">Quick links</h2>
            <div className="rounded-2xl border divide-y">
              {[
                { label: "Manage policies", href: "/dashboard/policies", count: null },
                { label: "Monitored repos", href: "/dashboard/repos", count: repoCount },
                { label: "API keys", href: "/dashboard/settings/api-keys", count: null },
              ].map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center justify-between px-4 py-3 hover:bg-accent">
                  <span className="text-[13px]">{item.label}</span>
                  {item.count !== null ? (
                    <span className="text-[12px] text-muted-foreground">{item.count}</span>
                  ) : (
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
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
