-- 001_initial_schema.sql
-- Core tables: organizations, members, repos, policies, reports, connections

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table repos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, full_name)
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid references repos(id) on delete cascade,
  mode text not null default 'monitor' check (mode in ('monitor', 'restrict')),
  allowed_domains text[] not null default '{}',
  blocked_domains text[] not null default '{}',
  blocked_ips text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid references repos(id) on delete set null,
  repo_full_name text not null,
  workflow_name text not null default '',
  run_id text not null,
  run_url text not null default '',
  branch text not null default '',
  commit_sha text not null default '',
  mode text not null default 'monitor',
  connection_count integer not null default 0,
  blocked_count integer not null default 0,
  status text not null default 'clean' check (status in ('clean', 'warning', 'blocked')),
  created_at timestamptz not null default now()
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  ts timestamptz not null default now(),
  event text not null default '',
  domain text not null default '',
  ip text not null default '',
  port integer not null default 0,
  pid integer not null default 0,
  ppid integer not null default 0,
  process text not null default ''
);

-- Index for fast connection lookups
create index connections_report_id_idx on connections(report_id);
create index reports_org_id_idx on reports(org_id);
create index reports_repo_id_idx on reports(repo_id);
create index repos_org_id_idx on repos(org_id);
create index policies_org_id_idx on policies(org_id);

-- Updated_at trigger for policies
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger policies_updated_at
  before update on policies
  for each row execute function update_updated_at();
