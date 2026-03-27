import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("org_id", membership?.org_id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle>CI run reports</CardTitle>
          <CardDescription>
            Connection reports from all monitored repos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!reports || reports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No reports yet.
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
                      {report.repo_full_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {report.branch} &middot;{" "}
                      {report.commit_sha?.slice(0, 7)} &middot; Run #
                      {report.run_id} &middot;{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {report.connection_count} connections
                    </Badge>
                    <Badge
                      variant={
                        report.blocked_count > 0 ? "destructive" : "secondary"
                      }
                    >
                      {report.blocked_count > 0
                        ? `${report.blocked_count} blocked`
                        : "clean"}
                    </Badge>
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
