-- 007_admin.sql
-- Admin backoffice: admin users, known endpoints (threat intel), agent binaries, storage

-- Admin users table (configurable access list)
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

-- Seed initial admin
insert into admin_users (email) values ('281332@gmail.com');

-- RPC to check if current user is admin
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where email = (select email from auth.users where id = auth.uid())
  );
$$;

-- Known endpoints (threat intel + safe list)
create table known_endpoints (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  type text not null check (type in ('malicious', 'safe')),
  source text,
  description text,
  added_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index known_endpoints_domain_type on known_endpoints(domain, type);
create index known_endpoints_type_idx on known_endpoints(type);

-- Seed known malicious endpoints (Trivy attack C2 domains)
insert into known_endpoints (domain, type, source, description) values
  ('scan.aquasecurtiy.org', 'malicious', 'trivy-attack-2026', 'Trivy/TeamPCP supply chain attack C2 server'),
  ('tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io', 'malicious', 'trivy-attack-2026', 'Trivy attack fallback C2 on Internet Computer'),
  ('plug-tab-protective-relay.trycloudflare.com', 'malicious', 'trivy-attack-2026', 'Trivy attack fallback C2 via Cloudflare tunnel');

-- Agent binaries metadata (tracks uploaded hook .so versions)
create table agent_binaries (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  arch text not null check (arch in ('x86_64', 'arm64')),
  file_size integer,
  sha256_hash text,
  storage_path text not null,
  is_latest boolean not null default false,
  uploaded_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index agent_binaries_version_arch on agent_binaries(version, arch);
create index agent_binaries_is_latest_idx on agent_binaries(is_latest) where is_latest = true;

-- Storage bucket for agent binaries (private, service-role upload only)
insert into storage.buckets (id, name, public)
values ('agent', 'agent', false)
on conflict (id) do nothing;

-- Agent download audit log
create table agent_downloads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  version text not null,
  arch text not null,
  created_at timestamptz not null default now()
);

create index agent_downloads_org_id_idx on agent_downloads(org_id);
create index agent_downloads_created_at_idx on agent_downloads(created_at);

-- RLS: admin tables are accessed via service-role, no user-level RLS needed
-- but enable RLS and add service-role bypass for safety
alter table admin_users enable row level security;
alter table known_endpoints enable row level security;
alter table agent_binaries enable row level security;
alter table agent_downloads enable row level security;
