-- 015_minimal_invite_email.sql
-- Redesign all emails: clean white minimalistic style

-- ── Approval email ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_approve_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _api_key text;
  _app_url text;
  _email text;
  _html text;
BEGIN
  INSERT INTO approved_users (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT email INTO _email FROM auth.users WHERE id = target_user_id;

  SELECT value INTO _api_key FROM dapipe_config WHERE key = 'resend_api_key';
  SELECT value INTO _app_url FROM dapipe_config WHERE key = 'app_url';

  _html :=
    '<!DOCTYPE html>'
    || '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;">'
    || '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:48px 16px;">'
    || '<tr><td align="center">'

    || '<table width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;border-radius:12px;overflow:hidden;background:#ffffff;">'

    || '<tr><td style="padding:40px 40px 0 40px;">'
    || '<h1 style="font-size:20px;font-weight:700;margin:0;color:#18181b;letter-spacing:-0.3px;">dapipe<span style="color:#a1a1aa;">.</span></h1>'
    || '</td></tr>'

    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0;">Your access has been approved. You can now sign in and start monitoring your CI pipelines.</p>'
    || '</td></tr>'

    || '<tr><td style="padding:24px 40px 0 40px;">'
    || '<a href="' || _app_url || '" style="display:inline-block;padding:10px 24px;font-size:13px;font-weight:600;color:#ffffff;background:#18181b;border-radius:8px;text-decoration:none;">Open DaPipe</a>'
    || '</td></tr>'

    || '<tr><td style="padding:32px 40px 36px 40px;">'
    || '<p style="font-size:12px;line-height:1.5;color:#a1a1aa;margin:0;">If you didn''t request this, you can ignore this email.</p>'
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
        'subject', 'Welcome to DaPipe',
        'html', _html
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_user(uuid) TO authenticated;

-- ── Invitation email ─────────────────────────────────────────

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
    || '<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;">'
    || '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:48px 16px;">'
    || '<tr><td align="center">'

    || '<table width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;border-radius:12px;overflow:hidden;background:#ffffff;">'

    -- Content
    || '<tr><td style="padding:40px 40px 0 40px;">'
    || '<h1 style="font-size:20px;font-weight:700;margin:0;color:#18181b;letter-spacing:-0.3px;">dapipe<span style="color:#a1a1aa;">.</span></h1>'
    || '</td></tr>'

    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0;">'
    || _inviter_name || ' invited you to join <strong>' || _org_name || '</strong> on DaPipe.</p>'
    || '</td></tr>'

    -- Button
    || '<tr><td style="padding:24px 40px 0 40px;">'
    || '<a href="' || _app_url || '/invite?token=' || _token || '" style="display:inline-block;padding:10px 24px;font-size:13px;font-weight:600;color:#ffffff;background:#18181b;border-radius:8px;text-decoration:none;">Accept invitation</a>'
    || '</td></tr>'

    -- Footer
    || '<tr><td style="padding:32px 40px 36px 40px;">'
    || '<p style="font-size:12px;line-height:1.5;color:#a1a1aa;margin:0;">This invitation expires in 7 days.</p>'
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
        'subject', _inviter_name || ' invited you to ' || _org_name,
        'html', _html
      )
    );
  END IF;
END;
$$;
