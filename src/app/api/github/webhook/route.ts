import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/github";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Read raw body BEFORE parsing — required for signature verification
  const rawBody = await request.text();

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const event = request.headers.get("x-github-event");
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  try {
    switch (event) {
      case "installation":
        await handleInstallation(supabase, payload);
        break;
      case "installation_repositories":
        await handleInstallationRepositories(supabase, payload);
        break;
      case "pull_request":
        await handlePullRequest(supabase, payload);
        break;
      default:
        // Unhandled event — acknowledge silently
        break;
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${event}:`, err);
    // Still return 200 so GitHub doesn't retry
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// installation event
// ---------------------------------------------------------------------------

async function handleInstallation(supabase: any, payload: any) {
  const { action, installation, repositories } = payload;

  if (action === "created") {
    const installationId = installation.id;
    const account = installation.account;

    // The callback route stores the installation -> org_id mapping first.
    // If the record already exists (from callback), upsert updates it.
    // If not, we create a placeholder with a null-safe org_id that the
    // callback will fill in later.

    const { data: existing } = await supabase
      .from("github_installations")
      .select("id, org_id")
      .eq("installation_id", installationId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update the record the callback already created
      await supabase
        .from("github_installations")
        .update({
          github_org_login: account.login,
          github_org_id: account.id,
          repository_selection: installation.repository_selection || "all",
          uninstalled_at: null,
          suspended_at: null,
        })
        .eq("id", existing.id);

      // Insert repos tied to this installation
      if (repositories && repositories.length > 0) {
        await insertRepos(supabase, existing.id, existing.org_id, repositories);
      }
    } else {
      // Callback hasn't fired yet — we cannot create a record without org_id
      // (it's NOT NULL in the schema). Log and skip; the callback will handle it.
      console.warn(
        `[webhook] installation.created for ${installationId} but no callback record yet — skipping.`
      );
    }
  } else if (action === "deleted") {
    await supabase
      .from("github_installations")
      .update({ uninstalled_at: new Date().toISOString() })
      .eq("installation_id", installation.id);
  } else if (action === "suspend") {
    await supabase
      .from("github_installations")
      .update({ suspended_at: new Date().toISOString() })
      .eq("installation_id", installation.id);
  } else if (action === "unsuspend") {
    await supabase
      .from("github_installations")
      .update({ suspended_at: null })
      .eq("installation_id", installation.id);
  }
}

// ---------------------------------------------------------------------------
// installation_repositories event
// ---------------------------------------------------------------------------

async function handleInstallationRepositories(supabase: any, payload: any) {
  const { action, installation } = payload;

  // Look up our internal installation record
  const { data: inst } = await supabase
    .from("github_installations")
    .select("id, org_id, repository_selection")
    .eq("installation_id", installation.id)
    .limit(1)
    .maybeSingle();

  if (!inst) {
    console.warn(
      `[webhook] installation_repositories for unknown installation ${installation.id}`
    );
    return;
  }

  if (action === "added") {
    const repos = payload.repositories_added || [];
    const autoSelect = inst.repository_selection === "all";

    const rows = repos.map((r: any) => ({
      installation_id: inst.id,
      org_id: inst.org_id,
      github_repo_id: r.id,
      github_repo_full_name: r.full_name,
      status: "pending",
      selected: autoSelect,
    }));

    if (rows.length > 0) {
      await supabase
        .from("github_repo_deployments")
        .upsert(rows, { onConflict: "installation_id,github_repo_id" });
    }
  } else if (action === "removed") {
    const repos = payload.repositories_removed || [];
    const repoIds = repos.map((r: any) => r.id);

    if (repoIds.length > 0) {
      await supabase
        .from("github_repo_deployments")
        .delete()
        .eq("installation_id", inst.id)
        .in("github_repo_id", repoIds);
    }
  }
}

// ---------------------------------------------------------------------------
// pull_request event
// ---------------------------------------------------------------------------

async function handlePullRequest(supabase: any, payload: any) {
  const { action, pull_request } = payload;

  if (action !== "closed") return;

  const headBranch: string = pull_request.head?.ref || "";
  if (!headBranch.startsWith("dapipe/")) return;

  const repoFullName: string = payload.repository?.full_name || "";
  const prNumber: number = pull_request.number;
  const merged: boolean = !!pull_request.merged;

  // Find the deployment record by repo name and pr_number
  const { data: deployment } = await supabase
    .from("github_repo_deployments")
    .select("id, status")
    .eq("github_repo_full_name", repoFullName)
    .eq("pr_number", prNumber)
    .limit(1)
    .maybeSingle();

  if (!deployment) return;

  if (merged) {
    const newStatus =
      deployment.status === "remove_pr_open" ? "removed" : "pr_merged";
    await supabase
      .from("github_repo_deployments")
      .update({
        status: newStatus,
        pr_merged_at: new Date().toISOString(),
      })
      .eq("id", deployment.id);
  } else {
    const newStatus =
      deployment.status === "remove_pr_open" ? "pr_merged" : "pr_closed";
    await supabase
      .from("github_repo_deployments")
      .update({ status: newStatus })
      .eq("id", deployment.id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertRepos(
  supabase: any,
  installationRecordId: string,
  orgId: string,
  repositories: any[]
) {
  const rows = repositories.map((r: any) => ({
    installation_id: installationRecordId,
    org_id: orgId,
    github_repo_id: r.id,
    github_repo_full_name: r.full_name,
    status: "pending",
    selected: false,
  }));

  await supabase
    .from("github_repo_deployments")
    .upsert(rows, { onConflict: "installation_id,github_repo_id" });
}
