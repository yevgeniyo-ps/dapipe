-- 006_fix_org_provisioning_rls.sql
-- Add workflow_name column + fix missing INSERT policies for org provisioning.

-- Add workflow_name column to reports (was missing from initial schema)
alter table reports add column if not exists workflow_name text not null default '';

-- Fix missing INSERT policies that prevent auto-provisioning of new orgs.
--
-- Problem: When a new approved user first visits the dashboard, the layout
-- tries to create an organization and add the user as the first member.
-- Two RLS gaps blocked this:
--   1. organizations had no INSERT policy at all.
--   2. org_members INSERT policy required user_in_org(), which fails for
--      the very first member (chicken-and-egg).
--
-- The application code now uses the service-role client for this bootstrap
-- step, but we also add these policies as a defense-in-depth measure so
-- the flow works even if someone later switches back to the session client.

-- Allow any authenticated user to create an organization.
do $$ begin
  create policy "org_insert" on organizations
    for insert
    with check (auth.uid() is not null);
exception when duplicate_object then null;
end $$;

-- Allow a user to add themselves as the first member of an org that has
-- no members yet. Subsequent members can be added by existing members
-- (covered by the existing members_insert policy).
do $$ begin
  create policy "members_self_insert" on org_members
    for insert
    with check (
      user_id = auth.uid()
      and not exists (
        select 1 from org_members m where m.org_id = org_members.org_id
      )
    );
exception when duplicate_object then null;
end $$;
