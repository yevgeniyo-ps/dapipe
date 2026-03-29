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

  // Fetch global base endpoints (safe + malicious) from BO
  const { data: globalEndpoints } = await supabase
    .from("known_endpoints")
    .select("domain, type");

  const baseSafe = (globalEndpoints || [])
    .filter((e: { type: string }) => e.type === "safe")
    .map((e: { domain: string }) => e.domain);
  const baseMalicious = (globalEndpoints || [])
    .filter((e: { type: string }) => e.type === "malicious")
    .map((e: { domain: string }) => e.domain);

  // BO has priority:
  // - BO safe: always allowed, even if customer blocked it
  // - BO malicious: always blocked, even if customer allowed it
  const boSafeSet = new Set(baseSafe);
  const boMaliciousSet = new Set(baseMalicious);

  // Customer allowed minus BO malicious
  const customerAllowed = (policy?.allowed_domains || []).filter(
    (d: string) => !boMaliciousSet.has(d)
  );
  // Customer blocked minus BO safe
  const customerBlocked = (policy?.blocked_domains || []).filter(
    (d: string) => !boSafeSet.has(d)
  );
  // Customer blocked IPs minus BO safe IPs
  const customerBlockedIps = (policy?.blocked_ips || []).filter(
    (ip: string) => !boSafeSet.has(ip)
  );

  const mergedAllowed = [...new Set([...baseSafe, ...customerAllowed])];
  const mergedBlocked = [...new Set([...baseMalicious, ...customerBlocked])];

  const response: PolicyResponse = {
    mode: policy?.mode || "monitor",
    allowed_domains: mergedAllowed,
    blocked_domains: mergedBlocked,
    blocked_ips: customerBlockedIps,
  };

  return NextResponse.json(response);
}
