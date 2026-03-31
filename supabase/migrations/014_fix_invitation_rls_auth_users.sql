-- 014_fix_invitation_rls_auth_users.sql
-- Fix: RLS policies on org_invitations referenced auth.users directly,
-- but authenticated role can't read that table. Use a SECURITY DEFINER
-- helper instead.

-- Helper: returns the current user's email (safe for RLS policies)
CREATE OR REPLACE FUNCTION auth_user_email()
RETURNS text AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Replace the policies that had inline auth.users queries
DROP POLICY IF EXISTS "invitations_read" ON org_invitations;
CREATE POLICY "invitations_read" ON org_invitations
  FOR SELECT USING (
    user_has_role(org_id, ARRAY['owner','admin'])
    OR email = auth_user_email()
  );

DROP POLICY IF EXISTS "invitations_update" ON org_invitations;
CREATE POLICY "invitations_update" ON org_invitations
  FOR UPDATE USING (
    email = auth_user_email()
  );
