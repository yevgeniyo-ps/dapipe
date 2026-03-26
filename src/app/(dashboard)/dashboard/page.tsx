import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitFork, ShieldCheck, FileBarChart, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's org
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user!.id)
    .limit(1)
    .single();

  const orgId = membership?.org_id;

  // Fetch stats
  const [reposRes, reportsRes, blockedRes] = await Promise.all([
    supabase
      .from("repos")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gt("blocked_count", 0),
  ]);

  const repoCount = reposRes.count || 0;
  const reportCount = reportsRes.count || 0;
  const blockedCount = blockedRes.count || 0;

  // Recent reports
  const { data: recentReports } = await supabase
    .from("reports")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = [
    { label: "Monitored repos", value: repoCount, icon: GitFork },
    { label: "Total CI runs", value: reportCount, icon: FileBarChart },
    {
      label: "Runs with blocks",
      value: blockedCount,
      icon: AlertTriangle,
    },
    {
      label: "Protection",
      value: repoCount > 0 ? "Active" : "Setup needed",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent CI runs</CardTitle>
          <CardDescription>Latest pipeline security reports</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentReports || recentReports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No reports yet. Add the DaPipe action to a repo with an API key to
              start seeing reports here.
            </p>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      {report.repo_full_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {report.branch} &middot;{" "}
                      {report.commit_sha?.slice(0, 7)} &middot;{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        report.blocked_count > 0 ? "destructive" : "secondary"
                      }
                    >
                      {report.blocked_count > 0
                        ? `${report.blocked_count} blocked`
                        : "clean"}
                    </Badge>
                    <Badge variant="outline">{report.mode}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
