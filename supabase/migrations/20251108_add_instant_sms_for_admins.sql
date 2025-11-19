-- Add instant SMS notification option for admins
-- Coaches use digest (existing), admins get instant alerts

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS instant_sms_enabled boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.instant_sms_enabled IS 'For admins: receive instant SMS when they get a new message (not digest)';

-- Note:
-- - Coaches use sms_alerts_enabled/email_alerts_enabled for daily unread alerts
-- - Admins use instant_sms_enabled (immediate notification on new message)
