-- 004_rls_policies.sql
-- Row Level Security on all tables

-- Helper: check if current user belongs to an org
create or replace function user_in_org(check_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table repos enable row level security;
alter table policies enable row level security;
alter table reports enable row level security;
alter table connections enable row level security;
alter table api_keys enable row level security;
alter table waitlist enable row level security;
alter table approved_users enable row level security;

-- Organizations: members can read their orgs
create policy "org_members_read" on organizations
  for select using (user_in_org(id));

create policy "org_members_update" on organizations
  for update using (user_in_org(id));

-- Org members: members can see other members
create policy "members_read" on org_members
  for select using (user_in_org(org_id));

create policy "members_insert" on org_members
  for insert with check (user_in_org(org_id));

create policy "members_delete" on org_members
  for delete using (user_in_org(org_id));

-- Repos
create policy "repos_read" on repos
  for select using (user_in_org(org_id));

create policy "repos_insert" on repos
  for insert with check (user_in_org(org_id));

create policy "repos_update" on repos
  for update using (user_in_org(org_id));

-- Policies
create policy "policies_read" on policies
  for select using (user_in_org(org_id));

create policy "policies_insert" on policies
  for insert with check (user_in_org(org_id));

create policy "policies_update" on policies
  for update using (user_in_org(org_id));

create policy "policies_delete" on policies
  for delete using (user_in_org(org_id));

-- Reports
create policy "reports_read" on reports
  for select using (user_in_org(org_id));

-- Connections: readable if user can read the parent report
create policy "connections_read" on connections
  for select using (
    exists (
      select 1 from reports
      where reports.id = connections.report_id
        and user_in_org(reports.org_id)
    )
  );

-- API keys: org members can manage
create policy "api_keys_read" on api_keys
  for select using (user_in_org(org_id));

create policy "api_keys_insert" on api_keys
  for insert with check (user_in_org(org_id));

create policy "api_keys_update" on api_keys
  for update using (user_in_org(org_id));

-- Waitlist: public insert, no read (admin only via service role)
create policy "waitlist_insert" on waitlist
  for insert with check (true);

-- Approved users: only readable by the user themselves
create policy "approved_users_read" on approved_users
  for select using (user_id = auth.uid());
