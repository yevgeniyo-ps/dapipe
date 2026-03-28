import { App, Octokit } from "octokit";
import crypto from "crypto";

let _app: App | null = null;

function getApp(): App {
  if (!_app) {
    _app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: Buffer.from(
        process.env.GITHUB_APP_PRIVATE_KEY!,
        "base64"
      ).toString("utf8"),
      webhooks: { secret: process.env.GITHUB_APP_WEBHOOK_SECRET! },
    });
  }
  return _app;
}

export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  return getApp().getInstallationOctokit(installationId);
}

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.GITHUB_APP_WEBHOOK_SECRET!)
      .update(payload)
      .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

export async function listWorkflowFiles(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".github/workflows",
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (f: { name: string; type: string }) =>
          f.type === "file" &&
          (f.name.endsWith(".yml") || f.name.endsWith(".yaml"))
      )
      .map((f: { path: string }) => f.path);
  } catch {
    return [];
  }
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    if ("content" in data && data.type === "file") {
      return {
        content: Buffer.from(data.content, "base64").toString("utf8"),
        sha: data.sha,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function createDaPipePR(
  octokit: Octokit,
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string }>,
  options: {
    branch: string;
    title: string;
    body: string;
    commitMessage: string;
  }
): Promise<{ prNumber: number; prUrl: string; branch: string }> {
  // Get default branch
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  // Get ref for default branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = ref.object.sha;

  // Create branch
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${options.branch}`,
      sha: baseSha,
    });
  } catch (e: unknown) {
    // Branch might already exist — update it
    if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 422) {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${options.branch}`,
        sha: baseSha,
        force: true,
      });
    } else {
      throw e;
    }
  }

  // Create/update files on the branch
  for (const file of files) {
    // Check if file exists to get its sha
    let fileSha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: file.path,
        ref: options.branch,
      });
      if ("sha" in data) fileSha = data.sha;
    } catch {
      // File doesn't exist yet
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      message: options.commitMessage,
      content: Buffer.from(file.content).toString("base64"),
      branch: options.branch,
      sha: fileSha,
    });
  }

  // Create PR
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: options.title,
    body: options.body,
    head: options.branch,
    base: defaultBranch,
  });

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    branch: options.branch,
  };
}
