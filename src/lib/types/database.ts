export type OrgRole = "owner" | "admin" | "member";
export type PolicyMode = "monitor" | "restrict";
export type ReportStatus = "clean" | "warning" | "blocked";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface ApiKey {
  id: string;
  org_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Repo {
  id: string;
  org_id: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Policy {
  id: string;
  org_id: string;
  repo_id: string | null;
  mode: PolicyMode;
  allowed_domains: string[];
  blocked_domains: string[];
  blocked_ips: string[];
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  org_id: string;
  repo_id: string | null;
  repo_full_name: string;
  workflow_name: string;
  run_id: string;
  run_url: string;
  branch: string;
  commit_sha: string;
  mode: PolicyMode;
  connection_count: number;
  blocked_count: number;
  status: ReportStatus;
  created_at: string;
}

export interface Connection {
  id: string;
  report_id: string;
  ts: string;
  event: string;
  domain: string;
  ip: string;
  port: number;
  pid: number;
  ppid: number;
  process: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  company: string | null;
  use_case: string | null;
  created_at: string;
}

export interface ApprovedUser {
  user_id: string;
  created_at: string;
}

export type DeploymentStatus =
  | "pending"
  | "scanning"
  | "no_workflows"
  | "pr_creating"
  | "pr_open"
  | "pr_merged"
  | "pr_closed"
  | "removing"
  | "remove_pr_open"
  | "removed"
  | "skipped"
  | "error";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface KnownEndpoint {
  id: string;
  domain: string;
  type: "malicious" | "safe";
  source: string | null;
  description: string | null;
  added_by: string | null;
  created_at: string;
}

export interface AgentBinary {
  id: string;
  version: string;
  arch: "x86_64" | "arm64";
  file_size: number | null;
  sha256_hash: string | null;
  storage_path: string;
  is_latest: boolean;
  uploaded_by: string | null;
  created_at: string;
}

export interface AgentDownload {
  id: string;
  org_id: string | null;
  version: string;
  arch: string;
  created_at: string;
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface OrgPermissions {
  canManageMembers: boolean;
  canInviteMembers: boolean;
  canManageSettings: boolean;
  canManageResources: boolean;
  canWrite: boolean;
  isReadOnly: boolean;
}

export interface OrgMembership {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: OrgRole;
}

export interface GitHubInstallation {
  id: string;
  org_id: string;
  installation_id: number;
  github_org_login: string;
  github_org_id: number;
  installed_by: string | null;
  repository_selection: "all" | "selected";
  suspended_at: string | null;
  uninstalled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepoDeployment {
  id: string;
  installation_id: string;
  org_id: string;
  repo_id: string | null;
  github_repo_id: number;
  github_repo_full_name: string;
  status: DeploymentStatus;
  selected: boolean;
  pr_number: number | null;
  pr_url: string | null;
  pr_branch: string | null;
  workflow_files: string[];
  error_message: string | null;
  scanned_at: string | null;
  pr_created_at: string | null;
  pr_merged_at: string | null;
  created_at: string;
  updated_at: string;
}
