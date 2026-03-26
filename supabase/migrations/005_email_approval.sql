-- 005_email_approval.sql
-- Resend email integration for user approval notifications

-- Enable pg_net for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Config table for secrets (Resend API key, app URL)
CREATE TABLE dapipe_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE dapipe_config ENABLE ROW LEVEL SECURITY;
-- No public policies — only SECURITY DEFINER functions read this

INSERT INTO dapipe_config (key, value) VALUES
  ('resend_api_key', 'YOUR_KEY'),
  ('app_url', 'https://app.dapipe.io');

-- Update approved_users to track who approved
ALTER TABLE approved_users ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- admin_approve_user() — approve a user and send branded email
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
  -- Insert approval record
  INSERT INTO approved_users (user_id)
  VALUES (target_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get user email
  SELECT email INTO _email FROM auth.users WHERE id = target_user_id;

  -- Get config
  SELECT value INTO _api_key FROM dapipe_config WHERE key = 'resend_api_key';
  SELECT value INTO _app_url FROM dapipe_config WHERE key = 'app_url';

  -- Build branded email HTML
  _html :=
    '<!DOCTYPE html>'
    || '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    || '<body style="margin:0;padding:0;background:#08060e;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;">'
    || '<table width="100%" cellpadding="0" cellspacing="0" style="background:#08060e;padding:40px 16px;">'
    || '<tr><td align="center">'

    -- Card container
    || '<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden;background:#0c0a12;border:1px solid #1c1928;">'

    -- Gradient accent bar (green/teal for security theme)
    || '<tr><td style="height:4px;background:linear-gradient(90deg,#10b981,#06b6d4,#3b82f6);"></td></tr>'

    -- Logo section
    || '<tr><td style="padding:36px 40px 0 40px;">'
    || '<h1 style="font-size:26px;font-weight:800;margin:0;color:#ffffff;letter-spacing:-0.5px;">DaPipe<span style="color:#10b981;">.</span></h1>'
    || '</td></tr>'

    -- Divider
    || '<tr><td style="padding:20px 40px 0 40px;"><div style="height:1px;background:#1c1928;"></div></td></tr>'

    -- Checkmark icon + heading
    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<table cellpadding="0" cellspacing="0"><tr>'
    || '<td style="width:44px;height:44px;background:rgba(16,185,129,0.12);border-radius:12px;text-align:center;vertical-align:middle;">'
    || '<span style="font-size:22px;line-height:44px;">&#10003;</span>'
    || '</td>'
    || '<td style="padding-left:16px;">'
    || '<h2 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">You''re in!</h2>'
    || '</td>'
    || '</tr></table>'
    || '</td></tr>'

    -- Body text
    || '<tr><td style="padding:16px 40px 0 40px;">'
    || '<p style="font-size:15px;line-height:1.7;color:#a09cb2;margin:0;">Your access to DaPipe has been approved. Sign in to manage your CI pipeline security policies, view reports, and protect your repos from supply chain attacks.</p>'
    || '</td></tr>'

    -- CTA button
    || '<tr><td style="padding:28px 40px 0 40px;">'
    || '<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:linear-gradient(135deg,#10b981,#06b6d4);">'
    || '<a href="' || _app_url || '" style="display:inline-block;padding:13px 36px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">Open DaPipe &rarr;</a>'
    || '</td></tr></table>'
    || '</td></tr>'

    -- Footer
    || '<tr><td style="padding:36px 40px 32px 40px;">'
    || '<p style="font-size:12px;line-height:1.6;color:#4a4660;margin:0;">You received this because your DaPipe account was approved. If you didn''t request this, you can ignore this email.</p>'
    || '</td></tr>'

    || '</table>'  -- end card
    || '</td></tr></table>'  -- end outer
    || '</body></html>';

  -- Send via Resend
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
        'subject', 'You''re in! Welcome to DaPipe',
        'html', _html
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_user(uuid) TO authenticated;
