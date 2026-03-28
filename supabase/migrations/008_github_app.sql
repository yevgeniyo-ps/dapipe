-- 008_github_app.sql
-- GitHub App installations and deployment tracking

-- Track GitHub App installations linked to DaPipe organizations
create table github_installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  installation_id bigint not null unique,
  github_org_login text not null,
  github_org_id bigint not null,
  installed_by uuid references auth.users(id) on delete set null,
  repository_selection text not null default 'all',
  suspended_at timestamptz,
  uninstalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index github_installations_org_id_idx on github_installations(org_id);
create index github_installations_installation_id_idx on github_installations(installation_id);

-- Deployment status enum
create type deployment_status as enum (
  'pending', 'scanning', 'no_workflows',
  'pr_creating', 'pr_open', 'pr_merged', 'pr_closed',
  'removing', 'remove_pr_open', 'removed',
  'skipped', 'error'
);

-- Track each repo's DaPipe deployment status
create table github_repo_deployments (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references github_installations(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  repo_id uuid references repos(id) on delete set null,
  github_repo_id bigint not null,
  github_repo_full_name text not null,
  status deployment_status not null default 'pending',
  selected boolean not null default false,
  pr_number integer,
  pr_url text,
  pr_branch text,
  workflow_files text[] not null default '{}',
  error_message text,
  scanned_at timestamptz,
  pr_created_at timestamptz,
  pr_merged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index github_repo_deployments_installation_idx on github_repo_deployments(installation_id);
create index github_repo_deployments_org_idx on github_repo_deployments(org_id);
create index github_repo_deployments_status_idx on github_repo_deployments(status);
create unique index github_repo_deployments_unique_repo on github_repo_deployments(installation_id, github_repo_id);

-- Apply updated_at triggers (reusing existing function from 001)
create trigger github_installations_updated_at
  before update on github_installations
  for each row execute function update_updated_at();

create trigger github_repo_deployments_updated_at
  before update on github_repo_deployments
  for each row execute function update_updated_at();

-- RLS policies
alter table github_installations enable row level security;
alter table github_repo_deployments enable row level security;

-- Dashboard users can read/write their own org's installations
create policy "gi_select" on github_installations
  for select using (user_in_org(org_id));

create policy "gi_insert" on github_installations
  for insert with check (user_in_org(org_id));

create policy "gi_update" on github_installations
  for update using (user_in_org(org_id));

create policy "grd_select" on github_repo_deployments
  for select using (user_in_org(org_id));

create policy "grd_update" on github_repo_deployments
  for update using (user_in_org(org_id));
