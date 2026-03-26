import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: repo } = await supabase
    .from("repos")
    .select("*")
    .eq("id", id)
    .single();

  if (!repo) notFound();

  // Get repo-specific policy
  const { data: policy } = await supabase
    .from("policies")
    .select("*")
    .eq("repo_id", id)
    .limit(1)
    .single();

  // Get recent reports for this repo
  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("repo_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{repo.full_name}</h1>
        <Badge variant={repo.is_active ? "secondary" : "outline"}>
          {repo.is_active ? "active" : "inactive"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy</CardTitle>
          <CardDescription>
            {policy
              ? `Repo-specific policy in ${policy.mode} mode`
              : "Using org-wide policy (no repo override)"}
          </CardDescription>
        </CardHeader>
        {policy && (
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Mode:</span>{" "}
              <Badge variant="outline">{policy.mode}</Badge>
            </div>
            {policy.allowed_domains.length > 0 && (
              <div>
                <span className="text-muted-foreground">Allowed domains:</span>{" "}
                {policy.allowed_domains.join(", ")}
              </div>
            )}
            {policy.blocked_domains.length > 0 && (
              <div>
                <span className="text-muted-foreground">Blocked domains:</span>{" "}
                {policy.blocked_domains.join(", ")}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent reports</CardTitle>
        </CardHeader>
        <CardContent>
          {!reports || reports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No reports yet for this repo.
            </p>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Run #{report.run_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {report.branch} &middot;{" "}
                      {report.commit_sha?.slice(0, 7)} &middot;{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  <Badge
                    variant={
                      report.blocked_count > 0 ? "destructive" : "secondary"
                    }
                  >
                    {report.blocked_count > 0
                      ? `${report.blocked_count} blocked`
                      : "clean"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
