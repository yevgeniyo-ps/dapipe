import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { ReportRequest } from "@/lib/types/api";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-dapipe-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-dapipe-api-key header" },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();

  // Lookup org by API key
  const { data: orgId, error: lookupError } = await supabase.rpc(
    "lookup_org_by_api_key",
    { raw_key: apiKey }
  );

  if (lookupError || !orgId) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 }
    );
  }

  let body: ReportRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!body.repo || !body.run_id) {
    return NextResponse.json(
      { error: "Missing required fields: repo, run_id" },
      { status: 400 }
    );
  }

  // Find or create repo
  let { data: repo } = await supabase
    .from("repos")
    .select("id")
    .eq("org_id", orgId)
    .eq("full_name", body.repo)
    .limit(1)
    .single();

  if (!repo) {
    const { data: newRepo } = await supabase
      .from("repos")
      .insert({ org_id: orgId, full_name: body.repo })
      .select("id")
      .single();
    repo = newRepo;
  }

  // Calculate stats
  const connections = body.connections || [];
  const blockedCount = connections.filter(
    (c) => c.event === "blocked"
  ).length;
  const status =
    blockedCount > 0 ? "blocked" : connections.length > 0 ? "warning" : "clean";

  // Insert report
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      org_id: orgId,
      repo_id: repo?.id || null,
      repo_full_name: body.repo,
      workflow_name: body.workflow_name || "",
      job_name: (body as any).job_name || "",
      run_id: body.run_id,
      run_url: body.run_url || "",
      branch: body.branch || "",
      commit_sha: body.commit_sha || "",
      mode: body.mode || "monitor",
      resolved_ips: (body as any).resolved_ips || [],
      connection_count: connections.length,
      blocked_count: blockedCount,
      status,
    })
    .select("id")
    .single();

  if (reportError || !report) {
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 }
    );
  }

  // Bulk insert connections
  if (connections.length > 0) {
    const rows = connections.map((c) => {
      // Convert numeric timestamp (epoch seconds) to ISO string
      let ts: string;
      if (typeof c.ts === "number") {
        ts = new Date(c.ts * 1000).toISOString();
      } else if (typeof c.ts === "string" && !isNaN(Number(c.ts))) {
        ts = new Date(Number(c.ts) * 1000).toISOString();
      } else {
        ts = c.ts || new Date().toISOString();
      }
      return {
        report_id: report.id,
        ts,
        event: c.event || "",
        domain: c.domain || "",
        ip: c.ip || "",
        port: c.port || 0,
        pid: c.pid || 0,
        ppid: c.ppid || 0,
        process: c.process || "",
      };
    });

    const { error: connError } = await supabase.from("connections").insert(rows);
    if (connError) {
      console.error("Failed to insert connections:", connError.message);
    }
  }

  return NextResponse.json({
    id: report.id,
    status,
    blocked_count: blockedCount,
    connection_count: connections.length,
  });
}
