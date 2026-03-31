-- 013_multi_org_rbac_invitations.sql
-- Multi-org RBAC enforcement, org invitations, role-aware RLS policies

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════
-- 1. New helper functions (keep existing user_in_org for read checks)
-- ══════════════════════════════════════════════════════════════

-- Returns the user's role in the given org, or NULL if not a member.
CREATE OR REPLACE FUNCTION user_org_role(check_org_id uuid)
RETURNS text AS $$
  SELECT role FROM org_members
  WHERE org_id = check_org_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- True if user has one of the given roles in the org.
CREATE OR REPLACE FUNCTION user_has_role(check_org_id uuid, allowed_roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════════════════════
-- 2. org_invitations table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE INDEX org_invitations_token_idx ON org_invitations(token);
CREATE INDEX org_invitations_org_id_idx ON org_invitations(org_id);
CREATE INDEX org_invitations_email_idx ON org_invitations(email);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Org owners/admins can see all invitations for their org;
-- any user can see invitations addressed to their own email
CREATE POLICY "invitations_read" ON org_invitations
  FOR SELECT USING (
    user_has_role(org_id, ARRAY['owner','admin'])
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "invitations_insert" ON org_invitations
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

-- The invited user can update (accept) their own invitation
CREATE POLICY "invitations_update" ON org_invitations
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "invitations_delete" ON org_invitations
  FOR DELETE USING (user_has_role(org_id, ARRAY['owner','admin']));

-- ══════════════════════════════════════════════════════════════
-- 3. Send invitation email via Resend (same pattern as 005)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION send_invitation_email(
  _email text,
  _org_name text,
  _inviter_name text,
  _token text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _api_key text;
  _app_url text;
  _html text;
BEGIN
  SELECT value INTO _api_key FROM dapipe_config WHERE key = 'resend_api_key';
  SELECT value INTO _app_url FROM dapipe_config WHERE key = 'app_url';

  _html :=
    '<!DOCTYPE html>'
    || '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#08060e;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;">'
    || '<table width="100%" cellpadding="0" cellspacing="0" style="background:#08060e;padding:40px 16px;">'
    || '<tr><td align="center">'

    -- Card container
    || '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden;background:#0c0a12;border:1px solid #1c1928;">'

    -- Gradient accent bar
    || '<tr><td style="height:4px;background:linear-gradient(90deg,#10b981,#06b6d4,#3b82f6);"></td></tr>'

    -- Logo section
    || '<tr><td style="padding:36px 40px 0 40px;">'
    || '<h1 style="font-size:26px;font-weight:800;margin:0;color:#ffffff;letter-spacing:-0.5px;">DaPipe<span style="color:#10b981;">.</span></h1>'
    || '</td></tr>'

    -- Divider
    || '<tr><td style="padding:20px 40px 0 40px;"><div style="height:1px;background:#1c1928;"></div></td></tr>'

    -- Icon + heading
    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<table cellpadding="0" cellspacing="0"><tr>'
    || '<td style="width:44px;height:44px;background:rgba(59,130,246,0.12);border-radius:12px;text-align:center;vertical-align:middle;">'
    || '<span style="font-size:22px;line-height:44px;">&#9993;</span>'
    || '</td>'
    || '<td style="padding-left:16px;">'
    || '<h2 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">You''re invited!</h2>'
    || '</td>'
    || '</tr></table>'
    || '</td></tr>'

    -- Body text
    || '<tr><td style="padding:16px 40px 0 40px;">'
    || '<p style="font-size:15px;line-height:1.7;color:#a09cb2;margin:0;">'
    || '<strong style="color:#ffffff;">' || _inviter_name || '</strong>'
    || ' has invited you to join <strong style="color:#ffffff;">' || _org_name || '</strong>'
    || ' on DaPipe. Accept the invitation to start monitoring CI pipeline security together.</p>'
    || '</td></tr>'

    -- CTA button
    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:linear-gradient(135deg,#3b82f6,#06b6d4);">'
    || '<a href="' || _app_url || '/invite?token=' || _token || '" style="display:inline-block;padding:13px 36px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">Accept Invitation &rarr;</a>'
    || '</td></tr></table>'
    || '</td></tr>'

    -- Footer
    || '<tr><td style="padding:36px 40px 32px 40px;">'
    || '<p style="font-size:12px;line-height:1.6;color:#4a4660;margin:0;">This invitation expires in 7 days. If you didn''t expect this, you can safely ignore this email.</p>'
    || '</td></tr>'

    || '</table>'
    || '</td></tr></table>'
    || '</body></html>';

  IF _api_key IS NOT NULL AND _api_key != 'YOUR_KEY' THEN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'DaPipe <noreply@dapipe.io>',
        'to', _email,
        'subject', _inviter_name || ' invited you to ' || _org_name || ' on DaPipe',
        'html', _html
      )
    );
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. Replace RLS policies with role-aware versions
-- ══════════════════════════════════════════════════════════════

-- ── Organizations ────────────────────────────────────────────
-- Read: all members (keep)
-- Update: owner only (replace)
-- Insert: any authenticated user (keep from 006)

DROP POLICY IF EXISTS "org_members_update" ON organizations;
CREATE POLICY "org_owner_update" ON organizations
  FOR UPDATE USING (user_has_role(id, ARRAY['owner']));

-- ── org_members ──────────────────────────────────────────────
-- Read: all members (keep)
-- Insert: owner/admin can add members (replace)
-- Update: owner only can change roles (new)
-- Delete: owner only can remove members (replace)

DROP POLICY IF EXISTS "members_insert" ON org_members;
CREATE POLICY "members_insert" ON org_members
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));
-- Note: members_self_insert from 006 is kept for org bootstrapping

CREATE POLICY "members_update" ON org_members
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner']));

DROP POLICY IF EXISTS "members_delete" ON org_members;
CREATE POLICY "members_delete" ON org_members
  FOR DELETE USING (user_has_role(org_id, ARRAY['owner']));

-- ── repos ────────────────────────────────────────────────────
-- Read: all members (keep)
-- Insert/Update: owner/admin only (replace)

DROP POLICY IF EXISTS "repos_insert" ON repos;
CREATE POLICY "repos_insert" ON repos
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "repos_update" ON repos;
CREATE POLICY "repos_update" ON repos
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner','admin']));

-- ── policies ─────────────────────────────────────────────────
-- Read: all members (keep)
-- Insert/Update/Delete: owner/admin only (replace)

DROP POLICY IF EXISTS "policies_insert" ON policies;
CREATE POLICY "policies_insert" ON policies
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "policies_update" ON policies;
CREATE POLICY "policies_update" ON policies
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "policies_delete" ON policies;
CREATE POLICY "policies_delete" ON policies
  FOR DELETE USING (user_has_role(org_id, ARRAY['owner','admin']));

-- ── api_keys ─────────────────────────────────────────────────
-- Read: all members (keep)
-- Insert/Update: owner/admin only (replace)

DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "api_keys_update" ON api_keys;
CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner','admin']));

-- ── audit_log ────────────────────────────────────────────────
-- Read: all members (keep)
-- Insert: owner/admin only (replace)

DROP POLICY IF EXISTS "audit_insert" ON audit_log;
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

-- ── github_installations ─────────────────────────────────────
-- Read: all members (keep)
-- Insert/Update: owner/admin only (replace)

DROP POLICY IF EXISTS "gi_insert" ON github_installations;
CREATE POLICY "gi_insert" ON github_installations
  FOR INSERT WITH CHECK (user_has_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "gi_update" ON github_installations;
CREATE POLICY "gi_update" ON github_installations
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner','admin']));

-- ── github_repo_deployments ──────────────────────────────────
-- Read: all members (keep)
-- Update: owner/admin only (replace)

DROP POLICY IF EXISTS "grd_update" ON github_repo_deployments;
CREATE POLICY "grd_update" ON github_repo_deployments
  FOR UPDATE USING (user_has_role(org_id, ARRAY['owner','admin']));
