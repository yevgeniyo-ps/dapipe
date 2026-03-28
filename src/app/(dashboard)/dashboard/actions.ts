"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

// ── API Keys ───────────────────────────────────────────────

export async function createApiKey(orgId: string, name: string) {
  const rawKey = `dp_${crypto.randomUUID().replace(/-/g, "")}`;
  const prefix = rawKey.slice(0, 10) + "...";
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({
    org_id: orgId,
    key_hash: keyHash,
    key_prefix: prefix,
    name,
  });

  if (error) return { error: error.message, key: null };

  revalidatePath("/dashboard/settings/api-keys");
  return { error: null, key: rawKey };
}

export async function revokeApiKey(keyId: string) {
  const supabase = await createClient();
  await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId);

  revalidatePath("/dashboard/settings/api-keys");
}

export async function getApiKeys(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .select("*")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return data || [];
}

// ── Policies ───────────────────────────────────────────────

export async function getPolicy(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policies")
    .select("*")
    .eq("org_id", orgId)
    .is("repo_id", null)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function savePolicy(
  orgId: string,
  policyId: string | null,
  payload: {
    mode: string;
    allowed_domains: string[];
    blocked_domains: string[];
    blocked_ips: string[];
  }
) {
  const supabase = await createClient();
  const row = { org_id: orgId, repo_id: null, ...payload };

  if (policyId) {
    await supabase.from("policies").update(row).eq("id", policyId);
  } else {
    await supabase.from("policies").insert(row);
  }

  revalidatePath("/dashboard/policies");
}

// ── GitHub App Deployment ──────────────────────────────────

export async function getGitHubInstallation(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("github_installations")
    .select("*")
    .eq("org_id", orgId)
    .is("uninstalled_at", null)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getDeployments(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("github_repo_deployments")
    .select("*")
    .eq("org_id", orgId)
    .order("github_repo_full_name", { ascending: true });
  return data || [];
}

export async function selectReposForDeployment(
  orgId: string,
  deploymentIds: string[]
) {
  const supabase = await createClient();
  // Deselect all first
  await supabase
    .from("github_repo_deployments")
    .update({ selected: false })
    .eq("org_id", orgId);
  // Select chosen ones
  if (deploymentIds.length > 0) {
    await supabase
      .from("github_repo_deployments")
      .update({ selected: true })
      .in("id", deploymentIds);
  }
  revalidatePath("/dashboard/deploy");
}

export async function selectAllRepos(orgId: string) {
  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ selected: true })
    .eq("org_id", orgId);
  // Also mark installation for auto-select on new repos
  await supabase
    .from("github_installations")
    .update({ repository_selection: "all" })
    .eq("org_id", orgId);
  revalidatePath("/dashboard/deploy");
}

export async function triggerDeploy(orgId: string) {
  const supabase = await createClient();
  // Get installation
  const { data: installation } = await supabase
    .from("github_installations")
    .select("id, installation_id")
    .eq("org_id", orgId)
    .is("uninstalled_at", null)
    .limit(1)
    .single();
  if (!installation) return { error: "No GitHub App installation found" };

  // Get selected deployments that need PRs
  const { data: deployments } = await supabase
    .from("github_repo_deployments")
    .select("id")
    .eq("org_id", orgId)
    .eq("selected", true)
    .in("status", ["pending", "pr_closed", "error"]);

  if (!deployments || deployments.length === 0)
    return { error: "No repos to deploy" };

  // Call the internal scan endpoint
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : "";
  const siteUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  await fetch(`${siteUrl}/api/github/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({
      installation_id: installation.id,
      deployment_ids: deployments.map((d: { id: string }) => d.id),
    }),
  });

  revalidatePath("/dashboard/deploy");
  return { error: null };
}

export async function triggerUninstall(orgId: string, deploymentIds: string[]) {
  const supabase = await createClient();

  const { data: installation } = await supabase
    .from("github_installations")
    .select("id")
    .eq("org_id", orgId)
    .is("uninstalled_at", null)
    .limit(1)
    .single();
  if (!installation) return { error: "No GitHub App installation found" };

  // Mark deployments as removing
  await supabase
    .from("github_repo_deployments")
    .update({ status: "removing" })
    .in("id", deploymentIds);

  const siteUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  await fetch(`${siteUrl}/api/github/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({
      installation_id: installation.id,
      deployment_ids: deploymentIds,
    }),
  });

  revalidatePath("/dashboard/deploy");
  return { error: null };
}

export async function skipDeployment(deploymentId: string) {
  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ status: "skipped" })
    .eq("id", deploymentId);
  revalidatePath("/dashboard/deploy");
}

export async function retryDeployment(deploymentId: string) {
  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ status: "pending", error_message: null })
    .eq("id", deploymentId);
  revalidatePath("/dashboard/deploy");
}

// ── Settings ───────────────────────────────────────────────

export async function getOrg(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  return data;
}

export async function saveOrg(orgId: string, name: string, slug: string) {
  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ name, slug })
    .eq("id", orgId);

  revalidatePath("/dashboard/settings");
}
