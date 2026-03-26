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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (!report) notFound();

  const { data: connections } = await supabase
    .from("connections")
    .select("*")
    .eq("report_id", id)
    .order("ts", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Report</h1>
        <Badge
          variant={report.blocked_count > 0 ? "destructive" : "secondary"}
        >
          {report.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{report.repo_full_name}</CardTitle>
          <CardDescription>
            Run #{report.run_id} &middot; {report.branch} &middot;{" "}
            {report.commit_sha?.slice(0, 7)} &middot;{" "}
            {new Date(report.created_at).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          <div>
            <p className="text-muted-foreground">Mode</p>
            <p className="font-medium">{report.mode}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Connections</p>
            <p className="font-medium">{report.connection_count}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Blocked</p>
            <p className="font-medium">{report.blocked_count}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Run URL</p>
            {report.run_url ? (
              <Link
                href={report.run_url}
                className="font-medium text-primary hover:underline"
                target="_blank"
              >
                View on GitHub
              </Link>
            ) : (
              <p className="font-medium text-muted-foreground">N/A</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            {connections?.length || 0} connection events captured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!connections || connections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No connection data.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>PID</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.map((conn) => (
                    <TableRow key={conn.id}>
                      <TableCell>
                        <Badge
                          variant={
                            conn.event === "blocked"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {conn.event}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {conn.domain || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {conn.ip || "-"}
                      </TableCell>
                      <TableCell>{conn.port}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {conn.process || "-"}
                      </TableCell>
                      <TableCell>{conn.pid}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(conn.ts).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
