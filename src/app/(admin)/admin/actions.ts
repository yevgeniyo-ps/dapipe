"use server";

import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

// ── GitHub App Status ───────────────────────────────────────

export async function getGitHubAppStatus() {
  return {
    appId: !!process.env.GITHUB_APP_ID,
    privateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: !!process.env.GITHUB_APP_WEBHOOK_SECRET,
    clientId: !!process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: !!process.env.GITHUB_APP_CLIENT_SECRET,
  };
}

// ── Overview Stats ──────────────────────────────────────────

export async function getAdminStats() {
  const supabase = createServiceClient();

  const [
    { count: orgsCount },
    { count: reposCount },
    { count: reportsCount },
    { count: apiKeysCount },
    { count: downloadsCount },
    { count: reportsToday },
    { count: reportsThisWeek },
    { data: blockedData },
    { data: latestBinaries },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("*", { count: "exact", head: true }),
    supabase.from("repos").select("*", { count: "exact", head: true }),
    supabase.from("reports").select("*", { count: "exact", head: true }),
    supabase
      .from("api_keys")
      .select("*", { count: "exact", head: true })
      .is("revoked_at", null),
    supabase
      .from("agent_downloads")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("reports")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    supabase
      .from("reports")
      .select("*", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString()
      ),
    supabase
      .from("reports")
      .select("blocked_count"),
    supabase
      .from("agent_binaries")
      .select("version")
      .eq("is_latest", true)
      .limit(1),
  ]);

  const totalBlockedConnections = (blockedData || []).reduce(
    (sum: number, r: { blocked_count: number }) => sum + (r.blocked_count || 0),
    0
  );

  const latestBinaryVersion =
    latestBinaries && latestBinaries.length > 0
      ? latestBinaries[0].version
      : null;

  return {
    total_orgs: orgsCount || 0,
    total_repos: reposCount || 0,
    total_reports: reportsCount || 0,
    total_api_keys: apiKeysCount || 0,
    total_agent_downloads: downloadsCount || 0,
    reports_today: reportsToday || 0,
    reports_this_week: reportsThisWeek || 0,
    total_blocked_connections: totalBlockedConnections,
    latest_binary_version: latestBinaryVersion,
  };
}

// ── Organizations ───────────────────────────────────────────

export async function listOrgs() {
  const supabase = createServiceClient();

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, orgs: [] };
  if (!orgs || orgs.length === 0) return { error: null, orgs: [] };

  // Fetch counts in parallel for each org
  const orgIds = orgs.map((o: { id: string }) => o.id);

  const [
    { data: memberCounts },
    { data: repoCounts },
    { data: reportCounts },
    { data: latestReports },
  ] = await Promise.all([
    supabase
      .from("org_members")
      .select("org_id")
      .in("org_id", orgIds),
    supabase
      .from("repos")
      .select("org_id")
      .in("org_id", orgIds),
    supabase
      .from("reports")
      .select("org_id")
      .in("org_id", orgIds),
    supabase
      .from("reports")
      .select("org_id, created_at")
      .in("org_id", orgIds)
      .order("created_at", { ascending: false }),
  ]);

  // Build count maps
  const membersMap: Record<string, number> = {};
  const reposMap: Record<string, number> = {};
  const reportsMap: Record<string, number> = {};
  const lastReportMap: Record<string, string> = {};

  for (const m of memberCounts || []) {
    membersMap[m.org_id] = (membersMap[m.org_id] || 0) + 1;
  }
  for (const r of repoCounts || []) {
    reposMap[r.org_id] = (reposMap[r.org_id] || 0) + 1;
  }
  for (const r of reportCounts || []) {
    reportsMap[r.org_id] = (reportsMap[r.org_id] || 0) + 1;
  }
  for (const r of latestReports || []) {
    if (!lastReportMap[r.org_id]) {
      lastReportMap[r.org_id] = r.created_at;
    }
  }

  const enrichedOrgs = orgs.map(
    (o: { id: string; name: string; slug: string; created_at: string }) => ({
      ...o,
      members_count: membersMap[o.id] || 0,
      repos_count: reposMap[o.id] || 0,
      reports_count: reportsMap[o.id] || 0,
      last_report_at: lastReportMap[o.id] || null,
    })
  );

  return { error: null, orgs: enrichedOrgs };
}

export async function getOrgDetail(orgId: string) {
  const supabase = createServiceClient();

  const [
    { data: org, error: orgError },
    { data: members },
    { data: repos },
    { data: policies },
    { data: apiKeys },
    { data: reports },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("repos")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("policies")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("api_keys")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (orgError || !org) {
    return { error: orgError?.message || "Organization not found", org: null };
  }

  // Resolve member emails from auth.users via admin API
  const membersWithEmail = await Promise.all(
    (members || []).map(
      async (m: {
        id: string;
        org_id: string;
        user_id: string;
        role: string;
        created_at: string;
      }) => {
        const {
          data: { user },
        } = await supabase.auth.admin.getUserById(m.user_id);
        return {
          ...m,
          email: user?.email || "unknown",
        };
      }
    )
  );

  return {
    error: null,
    org,
    members: membersWithEmail,
    repos: repos || [],
    policies: policies || [],
    api_keys: apiKeys || [],
    reports: reports || [],
  };
}

// ── Binaries ────────────────────────────────────────────────

export async function listBinaries() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("agent_binaries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, binaries: [] };
  return { error: null, binaries: data || [] };
}

export async function uploadBinary(formData: FormData) {
  const version = formData.get("version") as string;
  const arch = formData.get("arch") as string;
  const file = formData.get("file") as File;

  if (!version || !arch || !file) {
    return { error: "Missing required fields: version, arch, file" };
  }

  if (!["x86_64", "arm64"].includes(arch)) {
    return { error: "Invalid arch. Must be x86_64 or arm64" };
  }

  const supabase = createServiceClient();

  // Read file into buffer for hashing and upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Calculate SHA256 hash
  const sha256Hash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  // Upload to Supabase Storage
  const storagePath = `${version}/linux-${arch}/dapipe_hook.so`;

  const { error: uploadError } = await supabase.storage
    .from("agent")
    .upload(storagePath, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return { error: `Storage upload failed: ${uploadError.message}` };
  }

  // Insert into agent_binaries table
  const { data: binary, error: insertError } = await supabase
    .from("agent_binaries")
    .upsert(
      {
        version,
        arch,
        file_size: buffer.length,
        sha256_hash: sha256Hash,
        storage_path: storagePath,
        is_latest: false,
      },
      { onConflict: "version,arch" }
    )
    .select()
    .single();

  if (insertError) {
    return { error: `Database insert failed: ${insertError.message}` };
  }

  revalidatePath("/admin/binaries");
  return { error: null, binary };
}

export async function setLatestBinary(binaryId: string) {
  const supabase = createServiceClient();

  // Fetch the binary to get its arch
  const { data: binary, error: fetchError } = await supabase
    .from("agent_binaries")
    .select("arch")
    .eq("id", binaryId)
    .single();

  if (fetchError || !binary) {
    return { error: fetchError?.message || "Binary not found" };
  }

  // Unset is_latest for all binaries of the same arch
  const { error: unsetError } = await supabase
    .from("agent_binaries")
    .update({ is_latest: false })
    .eq("arch", binary.arch)
    .eq("is_latest", true);

  if (unsetError) {
    return { error: `Failed to unset latest: ${unsetError.message}` };
  }

  // Set this binary as latest
  const { error: setError } = await supabase
    .from("agent_binaries")
    .update({ is_latest: true })
    .eq("id", binaryId);

  if (setError) {
    return { error: `Failed to set latest: ${setError.message}` };
  }

  revalidatePath("/admin/binaries");
  return { error: null };
}

export async function deleteBinary(binaryId: string) {
  const supabase = createServiceClient();

  // Fetch the binary record to get storage_path
  const { data: binary, error: fetchError } = await supabase
    .from("agent_binaries")
    .select("storage_path")
    .eq("id", binaryId)
    .single();

  if (fetchError || !binary) {
    return { error: fetchError?.message || "Binary not found" };
  }

  // Delete from Supabase Storage
  const { error: storageError } = await supabase.storage
    .from("agent")
    .remove([binary.storage_path]);

  if (storageError) {
    return { error: `Storage delete failed: ${storageError.message}` };
  }

  // Delete from agent_binaries table
  const { error: deleteError } = await supabase
    .from("agent_binaries")
    .delete()
    .eq("id", binaryId);

  if (deleteError) {
    return { error: `Database delete failed: ${deleteError.message}` };
  }

  revalidatePath("/admin/binaries");
  return { error: null };
}

// ── Threat Intel (Known Endpoints) ──────────────────────────

export async function listEndpoints(type?: "malicious" | "safe") {
  const supabase = createServiceClient();

  let query = supabase
    .from("known_endpoints")
    .select("*")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) return { error: error.message, endpoints: [] };
  return { error: null, endpoints: data || [] };
}

export async function addEndpoint(
  domain: string,
  type: "malicious" | "safe",
  source?: string,
  description?: string
) {
  if (!domain || !type) {
    return { error: "Domain and type are required" };
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("known_endpoints")
    .upsert(
      {
        domain: domain.toLowerCase().trim(),
        type,
        source: source || null,
        description: description || null,
      },
      { onConflict: "domain,type" }
    )
    .select()
    .single();

  if (error) {
    return { error: `Failed to add endpoint: ${error.message}` };
  }

  revalidatePath("/admin/threat-intel");
  return { error: null, endpoint: data };
}

export async function removeEndpoint(endpointId: string) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("known_endpoints")
    .delete()
    .eq("id", endpointId);

  if (error) {
    return { error: `Failed to remove endpoint: ${error.message}` };
  }

  revalidatePath("/admin/threat-intel");
  return { error: null };
}

// ── Admin Users ─────────────────────────────────────────────

export async function listAdmins() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, admins: [] };
  return { error: null, admins: data || [] };
}

export async function addAdmin(email: string, name?: string) {
  if (!email) {
    return { error: "Email is required" };
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("admin_users")
    .upsert(
      {
        email: email.toLowerCase().trim(),
        name: name || null,
      },
      { onConflict: "email", ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error) {
    return { error: `Failed to add admin: ${error.message}` };
  }

  revalidatePath("/admin/admins");
  return { error: null, admin: data };
}

export async function removeAdmin(adminId: string) {
  const supabase = createServiceClient();

  // Safety: don't allow removing the last admin
  const { count } = await supabase
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  if ((count || 0) <= 1) {
    return { error: "Cannot remove the last admin user" };
  }

  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", adminId);

  if (error) {
    return { error: `Failed to remove admin: ${error.message}` };
  }

  revalidatePath("/admin/admins");
  return { error: null };
}
