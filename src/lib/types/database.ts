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
