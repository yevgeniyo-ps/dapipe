import type { PolicyMode } from "./database";

// GET /api/v1/policy response
export interface PolicyResponse {
  mode: PolicyMode;
  allowed_domains: string[];
  blocked_domains: string[];
  blocked_ips: string[];
}

// POST /api/v1/report request body
export interface ReportRequest {
  repo: string;
  workflow_name?: string;
  run_id: string;
  run_url: string;
  branch: string;
  commit_sha: string;
  mode: PolicyMode;
  connections: ConnectionEvent[];
}

export interface ConnectionEvent {
  ts: string;
  event: string;
  domain: string;
  ip: string;
  port: number;
  pid: number;
  ppid: number;
  process: string;
}

// POST /api/v1/report response
export interface ReportResponse {
  id: string;
  status: string;
}

// POST /api/waitlist request body
export interface WaitlistRequest {
  email: string;
  company?: string;
  use_case?: string;
}

// Generic API error
export interface ApiError {
  error: string;
}
