-- 1. Expand campaign status CHECK to include 'draft'
-- Allows saving email announcements as drafts for future editing/sending

-- Drop existing constraint and recreate (Postgres doesn't support ALTER CHECK)
ALTER TABLE public.competitor_announcement_campaigns
  DROP CONSTRAINT IF EXISTS competitor_announcement_campaigns_status_check;

ALTER TABLE public.competitor_announcement_campaigns
  ADD CONSTRAINT competitor_announcement_campaigns_status_check
  CHECK (status IN ('draft', 'pending', 'sending', 'sent', 'failed'));

-- 2. Fix recipient status CHECK — add 'failed' which the job handler uses on errors
-- Original constraint only had: queued, delivered, bounced, dropped, blocked, skipped
ALTER TABLE public.competitor_announcement_recipients
  DROP CONSTRAINT IF EXISTS competitor_announcement_recipients_status_check;

ALTER TABLE public.competitor_announcement_recipients
  ADD CONSTRAINT competitor_announcement_recipients_status_check
  CHECK (status IN ('queued', 'delivered', 'bounced', 'dropped', 'blocked', 'skipped', 'failed'));
