import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { PolicyResponse } from "@/lib/types/api";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const repoFullName = searchParams.get("repo");

  if (!repoFullName) {
    return NextResponse.json(
      { error: "Missing repo query parameter" },
      { status: 400 }
    );
  }

  // Auto-register repo if unknown
  let { data: repo } = await supabase
    .from("repos")
    .select("id")
    .eq("org_id", orgId)
    .eq("full_name", repoFullName)
    .limit(1)
    .single();

  if (!repo) {
    const { data: newRepo } = await supabase
      .from("repos")
      .insert({ org_id: orgId, full_name: repoFullName })
      .select("id")
      .single();
    repo = newRepo;
  }

  // Try repo-specific policy first
  let policy = null;
  if (repo) {
    const { data } = await supabase
      .from("policies")
      .select("*")
      .eq("org_id", orgId)
      .eq("repo_id", repo.id)
      .limit(1)
      .single();
    policy = data;
  }

  // Fall back to org-wide policy
  if (!policy) {
    const { data } = await supabase
      .from("policies")
      .select("*")
      .eq("org_id", orgId)
      .is("repo_id", null)
      .limit(1)
      .single();
    policy = data;
  }

  // Default response if no policy exists
  const response: PolicyResponse = {
    mode: policy?.mode || "monitor",
    allowed_domains: policy?.allowed_domains || [],
    blocked_domains: policy?.blocked_domains || [],
    blocked_ips: policy?.blocked_ips || [],
  };

  return NextResponse.json(response);
}
