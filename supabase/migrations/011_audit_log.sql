-- 011_audit_log.sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_org_id_idx on audit_log(org_id);
create index audit_log_created_at_idx on audit_log(created_at);

alter table audit_log enable row level security;

create policy "audit_read" on audit_log
  for select using (user_in_org(org_id));

create policy "audit_insert" on audit_log
  for insert with check (user_in_org(org_id));
