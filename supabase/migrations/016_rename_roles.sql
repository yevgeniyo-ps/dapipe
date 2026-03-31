-- 016_rename_roles.sql
-- Rename roles: owner→admin, admin→power, member→readonly

-- 1. Drop the CHECK constraint on org_members.role
ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_role_check;

-- 2. Migrate existing data (order matters: rename owner last to avoid collision with old admin)
UPDATE org_members SET role = 'power' WHERE role = 'admin';
UPDATE org_members SET role = 'admin' WHERE role = 'owner';
UPDATE org_members SET role = 'readonly' WHERE role = 'member';

-- 3. Add new CHECK constraint
ALTER TABLE org_members ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('admin', 'power', 'readonly'));

-- 4. Same for org_invitations
ALTER TABLE org_invitations DROP CONSTRAINT IF EXISTS org_invitations_role_check;
UPDATE org_invitations SET role = 'power' WHERE role = 'admin';
UPDATE org_invitations SET role = 'admin' WHERE role = 'owner';
UPDATE org_invitations SET role = 'readonly' WHERE role = 'member';
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_role_check
  CHECK (role IN ('admin', 'power', 'readonly'));

-- 5. Update RLS policies that reference role arrays
-- Organizations: admin only (was owner)
DROP POLICY IF EXISTS "org_owner_update" ON organizations;
CREATE POLICY "org_admin_update" ON organizations
  FOR UPDATE USING (user_has_role(id, ARRAY['admin']));

-- org_members: admin/power can insert (was owner/admin)
DROP POLICY IF EXISTS "members_insert" ON org_members;
CREATE POLICY "members_insert" ON org_members
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "members_update" ON org_members;
CREATE POLICY "members_update" ON org_members
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin']));

DROP POLICY IF EXISTS "members_delete" ON org_members;
CREATE POLICY "members_delete" ON org_members
  FOR DELETE USING (user_has_role(org_id, ARRAY['admin']));

-- repos
DROP POLICY IF EXISTS "repos_insert" ON repos;
CREATE POLICY "repos_insert" ON repos
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "repos_update" ON repos;
CREATE POLICY "repos_update" ON repos
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin','power']));

-- policies
DROP POLICY IF EXISTS "policies_insert" ON policies;
CREATE POLICY "policies_insert" ON policies
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "policies_update" ON policies;
CREATE POLICY "policies_update" ON policies
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "policies_delete" ON policies;
CREATE POLICY "policies_delete" ON policies
  FOR DELETE USING (user_has_role(org_id, ARRAY['admin','power']));

-- api_keys
DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "api_keys_update" ON api_keys;
CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin','power']));

-- audit_log
DROP POLICY IF EXISTS "audit_insert" ON audit_log;
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

-- github_installations
DROP POLICY IF EXISTS "gi_insert" ON github_installations;
CREATE POLICY "gi_insert" ON github_installations
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "gi_update" ON github_installations;
CREATE POLICY "gi_update" ON github_installations
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin','power']));

-- github_repo_deployments
DROP POLICY IF EXISTS "grd_update" ON github_repo_deployments;
CREATE POLICY "grd_update" ON github_repo_deployments
  FOR UPDATE USING (user_has_role(org_id, ARRAY['admin','power']));

-- org_invitations
DROP POLICY IF EXISTS "invitations_insert" ON org_invitations;
CREATE POLICY "invitations_insert" ON org_invitations
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "invitations_delete" ON org_invitations;
CREATE POLICY "invitations_delete" ON org_invitations
  FOR DELETE USING (user_has_role(org_id, ARRAY['admin','power']));

DROP POLICY IF EXISTS "invitations_read" ON org_invitations;
CREATE POLICY "invitations_read" ON org_invitations
  FOR SELECT USING (
    user_has_role(org_id, ARRAY['admin','power'])
    OR email = auth_user_email()
  );
