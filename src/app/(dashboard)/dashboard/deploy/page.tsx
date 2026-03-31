"use client";

import { useEffect, useState, useCallback } from "react";
import { useInterval } from "@/lib/use-interval";
import { useOrg } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Rocket,
  Github,
  ExternalLink,
  RotateCcw,
  X,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  getGitHubInstallation,
  getDeployments,
  selectReposForDeployment,
  selectAllRepos,
  triggerDeploy,
  triggerUninstall,
  skipDeployment,
  retryDeployment,
} from "../actions";

interface Installation {
  id: string;
  installation_id: number;
  github_org_login: string;
  repository_selection: string;
}

interface Deployment {
  id: string;
  github_repo_full_name: string;
  status: string;
  selected: boolean;
  pr_number: number | null;
  pr_url: string | null;
  workflow_files: string[];
  error_message: string | null;
  pr_merged_at: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "bg-zinc-600", icon: Clock },
  scanning: { label: "Scanning", color: "bg-blue-600", icon: Loader2 },
  no_workflows: { label: "No workflows", color: "bg-zinc-600", icon: AlertCircle },
  pr_creating: { label: "Creating PR", color: "bg-blue-600", icon: Loader2 },
  pr_open: { label: "PR open", color: "bg-yellow-600", icon: Clock },
  pr_merged: { label: "Active", color: "bg-emerald-600", icon: CheckCircle2 },
  pr_closed: { label: "PR closed", color: "bg-red-600", icon: X },
  removing: { label: "Removing", color: "bg-orange-600", icon: Loader2 },
  remove_pr_open: { label: "Removal PR open", color: "bg-orange-600", icon: Clock },
  removed: { label: "Removed", color: "bg-zinc-600", icon: Trash2 },
  skipped: { label: "Skipped", color: "bg-zinc-600", icon: X },
  error: { label: "Error", color: "bg-red-600", icon: AlertCircle },
};

export default function DeployPage() {
  const { orgId, permissions } = useOrg();
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [inst, deps] = await Promise.all([
        getGitHubInstallation(orgId),
        getDeployments(orgId),
      ]);
      setInstallation(inst as Installation | null);
      setDeployments((deps || []) as Deployment[]);
      // Initialize selected from DB
      const selected = new Set(
        (deps || [])
          .filter((d: Deployment) => d.selected)
          .map((d: Deployment) => d.id)
      );
      setSelectedIds(selected);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useInterval(load, 5000);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === deployments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deployments.map((d) => d.id)));
    }
  };

  const handleDeploy = async () => {
    if (!orgId) return;
    setDeploying(true);
    setError(null);
    try {
      // Save selection to DB first
      await selectReposForDeployment(orgId, Array.from(selectedIds));
      const result = await triggerDeploy(orgId);
      if (result?.error) setError(result.error);
      // Reload after a moment to see status changes
      setTimeout(() => load(), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleDeployAll = async () => {
    if (!orgId) return;
    setDeploying(true);
    setError(null);
    try {
      await selectAllRepos(orgId);
      const result = await triggerDeploy(orgId);
      if (result?.error) setError(result.error);
      setTimeout(() => load(), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleUninstall = async (deploymentId: string) => {
    if (!orgId) return;
    if (!confirm("Create a PR to remove DaPipe from this repo?")) return;
    await triggerUninstall(orgId, [deploymentId]);
    setTimeout(() => load(), 2000);
  };

  const handleSkip = async (deploymentId: string) => {
    if (!orgId) return;
    await skipDeployment(orgId, deploymentId);
    await load();
  };

  const handleRetry = async (deploymentId: string) => {
    if (!orgId) return;
    await retryDeployment(orgId, deploymentId);
    await load();
  };

  const installUrl = orgId
    ? `https://github.com/apps/dapipe/installations/new?state=${btoa(orgId)}`
    : "#";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // State 1: No GitHub App installed
  if (!installation) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-[20px] font-semibold">Deploy</h1>

        <div className="rounded-2xl border p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Github className="h-8 w-8 text-muted-foreground" />
            <div>
              <h3 className="text-[16px] font-semibold">
                Connect your GitHub organization
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Install the DaPipe GitHub App to deploy CI security monitoring
                across your repos.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-muted/50 p-4 space-y-3">
            <h4 className="text-[13px] font-semibold">How it works:</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[13px] text-muted-foreground">
              <li>
                Click &quot;Install GitHub App&quot; below
              </li>
              <li>Select your GitHub organization</li>
              <li>
                Choose which repos the app can access (all or selected)
              </li>
              <li>Confirm the installation</li>
              <li>
                Back here, select repos and click &quot;Deploy&quot; to
                create PRs
              </li>
            </ol>
          </div>

          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <h4 className="text-[13px] font-semibold">
              Before you install:
            </h4>
            <p className="text-[13px] text-muted-foreground">
              Make sure you have a <code className="text-[12px]">DAPIPE_API_KEY</code>{" "}
              org-level secret set in your GitHub organization. You can
              generate one in{" "}
              <a
                href="/dashboard/settings/api-keys"
                className="text-foreground underline"
              >
                API Keys settings
              </a>
              .
            </p>
          </div>

          <a href={installUrl}>
            <Button size="sm">
              <Github className="mr-2 h-4 w-4" />
              Install GitHub App
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // State 2: Connected
  const activeCount = deployments.filter(
    (d) => d.status === "pr_merged"
  ).length;
  const pendingCount = deployments.filter((d) =>
    ["pr_open", "pr_creating"].includes(d.status)
  ).length;
  const deployableCount = deployments.filter((d) =>
    ["pending", "pr_closed", "error"].includes(d.status)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold">Deploy</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Github className="h-3 w-3" />
            {installation.github_org_login}
          </Badge>
          <Badge variant="secondary">
            {activeCount} active
          </Badge>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-600 text-white">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3">
        {permissions.canManageResources && (
          <>
            <Button
              size="sm"
              onClick={handleDeploy}
              disabled={deploying || selectedIds.size === 0}
            >
              {deploying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-4 w-4" />
              )}
              Deploy Selected ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDeployAll}
              disabled={deploying || deployableCount === 0}
            >
              Deploy All
            </Button>
          </>
        )}
        <Button size="sm" variant="secondary" onClick={load}>
          <RotateCcw className="mr-2 h-3 w-3" />
          Refresh
        </Button>
      </div>

      {/* Repo table */}
      <div className="rounded-2xl border overflow-hidden">
        {deployments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-12 text-center">
            No repos found. Make sure the GitHub App has access to your
            repos.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === deployments.length &&
                      deployments.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Repository
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Workflows
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  PR
                </th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground uppercase tracking-[0.5px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((dep) => {
                const config = STATUS_CONFIG[dep.status] || STATUS_CONFIG.pending;
                const StatusIcon = config.icon;
                return (
                  <tr key={dep.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(dep.id)}
                        onChange={() => toggleSelect(dep.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium">
                      {dep.github_repo_full_name}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono">
                      {dep.workflow_files.length > 0
                        ? dep.workflow_files
                            .map((f) => f.split("/").pop())
                            .join(", ")
                        : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`${config.color} text-white gap-1`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      {dep.error_message && (
                        <p className="text-[11px] text-destructive mt-1 max-w-[200px] truncate">
                          {dep.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {dep.pr_url ? (
                        <a
                          href={dep.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] text-foreground hover:underline"
                        >
                          #{dep.pr_number}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">
                          --
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {permissions.canManageResources && (
                        <div className="flex items-center justify-end gap-1">
                          {dep.status === "pr_merged" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleUninstall(dep.id)}
                            >
                              Uninstall
                            </Button>
                          )}
                          {["error", "pr_closed"].includes(dep.status) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRetry(dep.id)}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" />
                              Retry
                            </Button>
                          )}
                          {["pending", "error"].includes(dep.status) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleSkip(dep.id)}
                            >
                              Skip
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
