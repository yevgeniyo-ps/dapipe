import { createServiceClient } from "@/lib/supabase/server";
import { getInstallationOctokit } from "@/lib/github";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const installationIdParam = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  if (!installationIdParam || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/deploy?error=missing_params", request.url)
    );
  }

  const installationId = parseInt(installationIdParam, 10);
  if (isNaN(installationId)) {
    return NextResponse.redirect(
      new URL("/dashboard/deploy?error=invalid_installation", request.url)
    );
  }

  // Decode org_id from state (base64-encoded for now)
  let orgId: string;
  try {
    orgId = Buffer.from(state, "base64").toString("utf8");
    // Basic UUID validation
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orgId
      )
    ) {
      throw new Error("Invalid org_id format");
    }
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/deploy?error=invalid_state", request.url)
    );
  }

  const supabase = createServiceClient();

  // -----------------------------------------------------------------------
  // Exchange code for GitHub user access token (if code was provided)
  // -----------------------------------------------------------------------
  let githubUserId: number | null = null;
  let githubUserLogin: string | null = null;

  if (code) {
    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_APP_CLIENT_ID!,
            client_secret: process.env.GITHUB_APP_CLIENT_SECRET!,
            code,
          }),
        }
      );

      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        // Get GitHub user info
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github+json",
          },
        });
        const userData = await userRes.json();
        githubUserId = userData.id;
        githubUserLogin = userData.login;
      }
    } catch (err) {
      console.error("[callback] Failed to exchange code for token:", err);
      // Non-fatal — continue without user info
    }
  }

  // -----------------------------------------------------------------------
  // Get installation info from GitHub using the App's JWT
  // -----------------------------------------------------------------------
  let githubOrgLogin = "";
  let githubOrgId = 0;
  let repositorySelection: "all" | "selected" = "all";

  try {
    const octokit = await getInstallationOctokit(installationId);
    const { data: instData } = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });
    const account = instData.account as { login?: string; id?: number } | null;
    githubOrgLogin = account?.login || "";
    githubOrgId = account?.id || 0;
    repositorySelection =
      (instData.repository_selection as "all" | "selected") || "all";
  } catch (err) {
    console.error("[callback] Failed to get installation info:", err);
    return NextResponse.redirect(
      new URL("/dashboard/deploy?error=github_api", request.url)
    );
  }

  // -----------------------------------------------------------------------
  // Upsert the github_installations record
  // -----------------------------------------------------------------------
  const { data: installation, error: upsertError } = await supabase
    .from("github_installations")
    .upsert(
      {
        org_id: orgId,
        installation_id: installationId,
        github_org_login: githubOrgLogin,
        github_org_id: githubOrgId,
        repository_selection: repositorySelection,
        uninstalled_at: null,
        suspended_at: null,
      },
      { onConflict: "installation_id" }
    )
    .select("id")
    .single();

  if (upsertError || !installation) {
    console.error("[callback] Failed to upsert installation:", upsertError);
    return NextResponse.redirect(
      new URL("/dashboard/deploy?error=db_error", request.url)
    );
  }

  // -----------------------------------------------------------------------
  // List repos in the installation and insert into github_repo_deployments
  // -----------------------------------------------------------------------
  try {
    const octokit = await getInstallationOctokit(installationId);
    const repos: any[] = [];
    let page = 1;

    // Paginate through all repos accessible to this installation
    while (true) {
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation(
        { per_page: 100, page }
      );
      repos.push(...data.repositories);
      if (repos.length >= data.total_count) break;
      page++;
    }

    if (repos.length > 0) {
      const rows = repos.map((r: any) => ({
        installation_id: installation.id,
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
  } catch (err) {
    console.error("[callback] Failed to list/insert repos:", err);
    // Non-fatal — the user can still see the deploy page
  }

  // -----------------------------------------------------------------------
  // Redirect to the deploy dashboard
  // -----------------------------------------------------------------------
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL("/", request.url).origin;
  return NextResponse.redirect(new URL("/dashboard/deploy", baseUrl));
}
