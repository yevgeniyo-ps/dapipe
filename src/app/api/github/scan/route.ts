import { createServiceClient } from "@/lib/supabase/server";
import {
  getInstallationOctokit,
  listWorkflowFiles,
  getFileContent,
  createDaPipePR,
} from "@/lib/github";
import { injectDaPipeSteps, removeDaPipeSteps } from "@/lib/workflow-injector";
import { NextResponse } from "next/server";

const PR_BODY_ADD = `## Add DaPipe CI Security Monitoring

This PR adds [DaPipe](https://dapipe.dev) security monitoring to your CI workflows.

### What is DaPipe?

DaPipe monitors outbound network connections during your CI builds to detect supply-chain attacks, dependency confusion, and data exfiltration in real time.

### What changed?

Each CI job now has two additional steps:

1. **DaPipe Setup** - Installs a lightweight eBPF-based network monitor before your build runs.
2. **DaPipe Analyze** - Collects the network activity log and reports it to your DaPipe dashboard.

No build commands or dependencies are modified. The monitoring is read-only in \`monitor\` mode (default).

### Next steps

- Merge this PR to start monitoring your CI pipelines.
- View results in your [DaPipe Dashboard](https://dapipe.dev/dashboard).
- Switch to \`restrict\` mode to block unauthorized connections.
`;

const PR_BODY_REMOVE = `## Remove DaPipe CI Security Monitoring

This PR removes [DaPipe](https://dapipe.dev) security monitoring steps from your CI workflows.

All DaPipe Setup and DaPipe Analyze steps have been removed. No other workflow configuration has been changed.
`;

export async function POST(request: Request) {
  // Auth: require the service role key as a shared secret
  const authHeader = request.headers.get("x-internal-secret");
  if (authHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: { installation_id: string; deployment_ids: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!body.installation_id || !body.deployment_ids?.length) {
    return NextResponse.json(
      { error: "Missing installation_id or deployment_ids" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Look up the installation record to get the numeric GitHub installation_id
  const { data: inst } = await supabase
    .from("github_installations")
    .select("id, installation_id")
    .eq("id", body.installation_id)
    .limit(1)
    .single();

  if (!inst) {
    return NextResponse.json(
      { error: "Installation not found" },
      { status: 404 }
    );
  }

  const octokit = await getInstallationOctokit(inst.installation_id);

  // Fetch deployments
  const { data: deployments } = await supabase
    .from("github_repo_deployments")
    .select("*")
    .in("id", body.deployment_ids)
    .eq("installation_id", body.installation_id);

  if (!deployments || deployments.length === 0) {
    return NextResponse.json(
      { error: "No deployments found" },
      { status: 404 }
    );
  }

  const results: Array<{
    id: string;
    repo: string;
    status: string;
    error?: string;
  }> = [];

  for (const deployment of deployments) {
    const [owner, repo] = deployment.github_repo_full_name.split("/");

    try {
      if (deployment.status === "removing") {
        // ------------------------------------------------------------------
        // REMOVAL flow
        // ------------------------------------------------------------------
        await updateDeployment(supabase, deployment.id, { status: "scanning" });

        const workflowPaths = await listWorkflowFiles(octokit, owner, repo);
        if (workflowPaths.length === 0) {
          await updateDeployment(supabase, deployment.id, {
            status: "removed",
          });
          results.push({
            id: deployment.id,
            repo: deployment.github_repo_full_name,
            status: "removed",
          });
          continue;
        }

        const filesToCommit: Array<{ path: string; content: string }> = [];
        for (const wfPath of workflowPaths) {
          const file = await getFileContent(octokit, owner, repo, wfPath);
          if (!file) continue;

          const { modified, hadDaPipe } = removeDaPipeSteps(file.content);
          if (hadDaPipe) {
            filesToCommit.push({ path: wfPath, content: modified });
          }
        }

        if (filesToCommit.length === 0) {
          // Nothing to remove
          await updateDeployment(supabase, deployment.id, {
            status: "removed",
          });
          results.push({
            id: deployment.id,
            repo: deployment.github_repo_full_name,
            status: "removed",
          });
          continue;
        }

        await updateDeployment(supabase, deployment.id, {
          status: "pr_creating",
        });

        const pr = await createDaPipePR(octokit, owner, repo, filesToCommit, {
          branch: "dapipe/remove-security-monitoring",
          title: "Remove DaPipe CI security monitoring",
          body: PR_BODY_REMOVE,
          commitMessage: "ci: remove DaPipe security monitoring",
        });

        await updateDeployment(supabase, deployment.id, {
          status: "remove_pr_open",
          pr_number: pr.prNumber,
          pr_url: pr.prUrl,
          pr_branch: pr.branch,
        });

        results.push({
          id: deployment.id,
          repo: deployment.github_repo_full_name,
          status: "remove_pr_open",
        });
      } else {
        // ------------------------------------------------------------------
        // INSTALL / SCAN flow
        // ------------------------------------------------------------------
        await updateDeployment(supabase, deployment.id, { status: "scanning" });

        const workflowPaths = await listWorkflowFiles(octokit, owner, repo);
        if (workflowPaths.length === 0) {
          await updateDeployment(supabase, deployment.id, {
            status: "no_workflows",
            scanned_at: new Date().toISOString(),
            workflow_files: [],
          });
          results.push({
            id: deployment.id,
            repo: deployment.github_repo_full_name,
            status: "no_workflows",
          });
          continue;
        }

        const filesToCommit: Array<{ path: string; content: string }> = [];
        let allInstrumented = true;
        const allWorkflowFiles: string[] = [];

        for (const wfPath of workflowPaths) {
          allWorkflowFiles.push(wfPath);
          const file = await getFileContent(octokit, owner, repo, wfPath);
          if (!file) continue;

          const { modified, jobsModified, alreadyInstrumented } =
            injectDaPipeSteps(file.content);

          if (alreadyInstrumented) {
            // This file already has DaPipe — skip
            continue;
          }

          if (jobsModified.length > 0) {
            filesToCommit.push({ path: wfPath, content: modified });
            allInstrumented = false;
          }
        }

        // Update workflow_files and scanned_at regardless
        await updateDeployment(supabase, deployment.id, {
          workflow_files: allWorkflowFiles,
          scanned_at: new Date().toISOString(),
        });

        if (filesToCommit.length === 0) {
          // All already instrumented or no eligible jobs
          const finalStatus = allInstrumented ? "pr_merged" : "skipped";
          await updateDeployment(supabase, deployment.id, {
            status: finalStatus,
          });
          results.push({
            id: deployment.id,
            repo: deployment.github_repo_full_name,
            status: finalStatus,
          });
          continue;
        }

        await updateDeployment(supabase, deployment.id, {
          status: "pr_creating",
        });

        const pr = await createDaPipePR(octokit, owner, repo, filesToCommit, {
          branch: "dapipe/add-security-monitoring",
          title: "Add DaPipe CI security monitoring",
          body: PR_BODY_ADD,
          commitMessage: "ci: add DaPipe security monitoring",
        });

        await updateDeployment(supabase, deployment.id, {
          status: "pr_open",
          pr_number: pr.prNumber,
          pr_url: pr.prUrl,
          pr_branch: pr.branch,
          pr_created_at: new Date().toISOString(),
        });

        results.push({
          id: deployment.id,
          repo: deployment.github_repo_full_name,
          status: "pr_open",
        });
      }
    } catch (err: any) {
      console.error(
        `[scan] Error processing ${deployment.github_repo_full_name}:`,
        err
      );
      await updateDeployment(supabase, deployment.id, {
        status: "error",
        error_message: err?.message || "Unknown error",
      });
      results.push({
        id: deployment.id,
        repo: deployment.github_repo_full_name,
        status: "error",
        error: err?.message || "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateDeployment(
  supabase: any,
  id: string,
  fields: Record<string, any>
) {
  const { error } = await supabase
    .from("github_repo_deployments")
    .update(fields)
    .eq("id", id);

  if (error) {
    console.error(`[scan] Failed to update deployment ${id}:`, error);
  }
}
