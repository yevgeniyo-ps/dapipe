"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import crypto from "crypto";
import type { OrgRole } from "@/lib/types/database";

// ── API Keys ───────────────────────────────────────────────

export async function createApiKey(orgId: string, name: string) {
  await requireRole(orgId, ["owner", "admin"]);

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

export async function revokeApiKey(orgId: string, keyId: string) {
  await requireRole(orgId, ["owner", "admin"]);

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
  await requireRole(orgId, ["owner", "admin"]);

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
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ selected: false })
    .eq("org_id", orgId);
  if (deploymentIds.length > 0) {
    await supabase
      .from("github_repo_deployments")
      .update({ selected: true })
      .in("id", deploymentIds);
  }
  revalidatePath("/dashboard/deploy");
}

export async function selectAllRepos(orgId: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ selected: true })
    .eq("org_id", orgId);
  await supabase
    .from("github_installations")
    .update({ repository_selection: "all" })
    .eq("org_id", orgId);
  revalidatePath("/dashboard/deploy");
}

export async function triggerDeploy(orgId: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  const { data: installation } = await supabase
    .from("github_installations")
    .select("id, installation_id")
    .eq("org_id", orgId)
    .is("uninstalled_at", null)
    .limit(1)
    .single();
  if (!installation) return { error: "No GitHub App installation found" };

  const { data: deployments } = await supabase
    .from("github_repo_deployments")
    .select("id")
    .eq("org_id", orgId)
    .eq("selected", true)
    .in("status", ["pending", "pr_closed", "error"]);

  if (!deployments || deployments.length === 0)
    return { error: "No repos to deploy" };

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
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  const { data: installation } = await supabase
    .from("github_installations")
    .select("id")
    .eq("org_id", orgId)
    .is("uninstalled_at", null)
    .limit(1)
    .single();
  if (!installation) return { error: "No GitHub App installation found" };

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

export async function skipDeployment(orgId: string, deploymentId: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ status: "skipped" })
    .eq("id", deploymentId);
  revalidatePath("/dashboard/deploy");
}

export async function retryDeployment(orgId: string, deploymentId: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  await supabase
    .from("github_repo_deployments")
    .update({ status: "pending", error_message: null })
    .eq("id", deploymentId);
  revalidatePath("/dashboard/deploy");
}

// ── Dashboard Overview ────────────────────────────────────

export async function getDashboardOverview(orgId: string) {
  const supabase = await createClient();
  const [reposRes, reportsRes, blockedRes, cleanRes, monitorRes, restrictRes] =
    await Promise.all([
      supabase.from("repos").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).gt("blocked_count", 0),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("blocked_count", 0),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("mode", "monitor"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("mode", "restrict"),
    ]);
  const { data: recentReports } = await supabase
    .from("reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20);
  return {
    repoCount: reposRes.count || 0,
    reportCount: reportsRes.count || 0,
    blockedCount: blockedRes.count || 0,
    cleanCount: cleanRes.count || 0,
    monitorCount: monitorRes.count || 0,
    restrictCount: restrictRes.count || 0,
    recentReports: recentReports || [],
  };
}

// ── Repos ─────────────────────────────────────────────────

export async function getRepos(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repos").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  return data || [];
}

export async function getRepoDetail(repoId: string) {
  const supabase = await createClient();
  const { data: repo } = await supabase.from("repos").select("*").eq("id", repoId).single();
  if (!repo) return null;
  const { data: policy } = await supabase.from("policies").select("*").eq("repo_id", repoId).limit(1).maybeSingle();
  const { data: reports } = await supabase.from("reports").select("*").eq("repo_id", repoId).order("created_at", { ascending: false }).limit(10);
  return { repo, policy, reports: reports || [] };
}

// ── Reports ───────────────────────────────────────────────

export async function getReports(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
  return data || [];
}

export async function getReportDetail(reportId: string) {
  const supabase = await createClient();
  const { data: report } = await supabase.from("reports").select("*").eq("id", reportId).single();
  if (!report) return null;
  const { data: connections } = await supabase.from("connections").select("*").eq("report_id", reportId).order("ts", { ascending: true });
  return { report, connections: connections || [] };
}

// ── Members ───────────────────────────────────────────────

export async function getMembers(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members").select("*").eq("org_id", orgId).order("created_at", { ascending: true });
  if (!data) return [];

  // Resolve emails via service client
  const service = createServiceClient();
  return Promise.all(
    data.map(async (m: any) => {
      const { data: { user } } = await service.auth.admin.getUserById(m.user_id);
      return {
        ...m,
        email: user?.email || "unknown",
        full_name: user?.user_metadata?.full_name || null,
      };
    })
  );
}

export async function changeMemberRole(orgId: string, memberId: string, newRole: OrgRole) {
  await requireRole(orgId, ["owner"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings/members");
  return { error: null };
}

export async function removeMember(orgId: string, memberId: string) {
  await requireRole(orgId, ["owner"]);

  const supabase = await createClient();

  // Prevent removing the last owner
  const { data: member } = await supabase
    .from("org_members").select("role").eq("id", memberId).single();
  if (member?.role === "owner") {
    const { count } = await supabase
      .from("org_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner");
    if ((count || 0) <= 1) return { error: "Cannot remove the last owner" };
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings/members");
  return { error: null };
}

// ── Invitations ──────────────────────────────────────────

export async function getInvitations(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_invitations")
    .select("*")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return data || [];
}

export async function inviteMember(orgId: string, email: string, role: OrgRole) {
  const { userId, role: callerRole } = await requireRole(orgId, ["owner", "admin"]);

  // Admin can't invite as owner
  if (callerRole === "admin" && role === "owner") {
    return { error: "Admins cannot invite owners" };
  }

  const supabase = await createClient();

  // Check if already a member by looking up user by email
  const service = createServiceClient();
  const { data: { users } } = await service.auth.admin.listUsers();
  const existingUser = users?.find(
    (u: any) => u.email?.toLowerCase() === email.toLowerCase().trim()
  );

  if (existingUser) {
    const { data: existingMember } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingMember) {
      return { error: "This user is already a member of this organization" };
    }
  }

  // Insert invitation (RLS enforces owner/admin)
  const { data: invitation, error } = await supabase
    .from("org_invitations")
    .insert({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      role,
      invited_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "This email has already been invited" };
    return { error: error.message };
  }

  // Send email
  const { data: org } = await service
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const { data: { user } } = await supabase.auth.getUser();
  const inviterName = user?.user_metadata?.full_name || user?.email || "A team member";

  await service.rpc("send_invitation_email", {
    _email: email.toLowerCase().trim(),
    _org_name: org?.name || "an organization",
    _inviter_name: inviterName,
    _token: invitation.token,
  });

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: orgId,
    user_id: userId,
    action: "invite_member",
    target: email,
    details: { role },
  });

  revalidatePath("/dashboard/settings/members");
  return { error: null };
}

export async function cancelInvitation(orgId: string, invitationId: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  await supabase
    .from("org_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("org_id", orgId);

  revalidatePath("/dashboard/settings/members");
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", orgId: null };

  const service = createServiceClient();

  // Find the invitation
  const { data: invitation } = await service
    .from("org_invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!invitation) return { error: "Invitation not found or expired", orgId: null };

  // Verify email matches
  if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
    return { error: "This invitation was sent to a different email address", orgId: null };
  }

  // Auto-approve if not already approved (invited = trusted)
  await service
    .from("approved_users")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  // Add to org
  const { error: memberError } = await service
    .from("org_members")
    .upsert(
      { org_id: invitation.org_id, user_id: user.id, role: invitation.role },
      { onConflict: "org_id,user_id" }
    );

  if (memberError) return { error: memberError.message, orgId: null };

  // Mark invitation accepted
  await service
    .from("org_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // Set cookie to the invited org
  const cookieStore = await cookies();
  cookieStore.set("dapipe-org", invitation.org_id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { error: null, orgId: invitation.org_id };
}

// ── Global Base Endpoints (from BO) ───────────────────────

export async function getBaseEndpoints() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("known_endpoints")
    .select("domain, type")
    .order("domain", { ascending: true });
  const safe = (data || [])
    .filter((e: { type: string }) => e.type === "safe")
    .map((e: { domain: string }) => e.domain);
  const malicious = (data || [])
    .filter((e: { type: string }) => e.type === "malicious")
    .map((e: { domain: string }) => e.domain);
  return { allowed: safe, blocked: malicious };
}

// ── Quick policy actions (from dashboard) ─────────────────

export async function addToAllowed(orgId: string, target: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let { data: policy } = await supabase
    .from("policies")
    .select("id, allowed_domains")
    .eq("org_id", orgId)
    .is("repo_id", null)
    .maybeSingle();

  const current = policy?.allowed_domains || [];
  if (current.includes(target)) return;

  if (policy) {
    await supabase
      .from("policies")
      .update({ allowed_domains: [...current, target] })
      .eq("id", policy.id);
  } else {
    await supabase
      .from("policies")
      .insert({ org_id: orgId, mode: "restrict", allowed_domains: [target], blocked_domains: [], blocked_ips: [] });
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    user_id: user?.id,
    action: "add_to_allowed",
    target,
    details: { source: "dashboard" },
  });

  revalidatePath("/dashboard");
}

export async function addToBlocked(orgId: string, target: string) {
  await requireRole(orgId, ["owner", "admin"]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target);

  let { data: policy } = await supabase
    .from("policies")
    .select("id, blocked_domains, blocked_ips")
    .eq("org_id", orgId)
    .is("repo_id", null)
    .maybeSingle();

  if (isIp) {
    const current = policy?.blocked_ips || [];
    if (current.includes(target)) return;
    if (policy) {
      await supabase.from("policies").update({ blocked_ips: [...current, target] }).eq("id", policy.id);
    } else {
      await supabase.from("policies").insert({ org_id: orgId, mode: "restrict", allowed_domains: [], blocked_domains: [], blocked_ips: [target] });
    }
  } else {
    const current = policy?.blocked_domains || [];
    if (current.includes(target)) return;
    if (policy) {
      await supabase.from("policies").update({ blocked_domains: [...current, target] }).eq("id", policy.id);
    } else {
      await supabase.from("policies").insert({ org_id: orgId, mode: "restrict", allowed_domains: [], blocked_domains: [target], blocked_ips: [] });
    }
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    user_id: user?.id,
    action: "add_to_blocked",
    target,
    details: { source: "dashboard", type: isIp ? "ip" : "domain" },
  });

  revalidatePath("/dashboard");
}

// ── Audit Log ─────────────────────────────────────────────

export async function getAuditLog(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
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
  await requireRole(orgId, ["owner"]);

  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ name, slug })
    .eq("id", orgId);

  revalidatePath("/dashboard/settings");
}

// ── Org Switching & Creation ──────────────────────────────

export async function switchOrg(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set("dapipe-org", orgId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createOrg(name: string, slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", orgId: null };

  const service = createServiceClient();
  const { data: org, error } = await service
    .from("organizations")
    .insert({ name, slug })
    .select()
    .single();

  if (error) return { error: error.message, orgId: null };

  await service
    .from("org_members")
    .insert({ org_id: org.id, user_id: user.id, role: "owner" });

  const cookieStore = await cookies();
  cookieStore.set("dapipe-org", org.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { error: null, orgId: org.id };
}
