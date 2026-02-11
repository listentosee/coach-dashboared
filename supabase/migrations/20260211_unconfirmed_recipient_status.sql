-- 1. Add 'unconfirmed' to recipient status CHECK constraint
-- 'unconfirmed' = dispatched to SendGrid but no delivery webhook received
ALTER TABLE public.competitor_announcement_recipients
  DROP CONSTRAINT IF EXISTS competitor_announcement_recipients_status_check;

ALTER TABLE public.competitor_announcement_recipients
  ADD CONSTRAINT competitor_announcement_recipients_status_check
  CHECK (status IN ('queued', 'unconfirmed', 'delivered', 'bounced', 'dropped', 'blocked', 'skipped', 'failed'));

-- 2. Replace get_campaign_stats RPC: rename total_queued → total_unconfirmed
-- Must DROP first because return type is changing
DROP FUNCTION IF EXISTS public.get_campaign_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_campaign_stats(p_campaign_id uuid)
RETURNS TABLE (
  total_recipients bigint,
  total_unconfirmed bigint,
  total_delivered bigint,
  total_bounced bigint,
  total_dropped bigint,
  total_blocked bigint,
  total_skipped bigint,
  total_opened bigint,
  total_clicked bigint
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status = 'unconfirmed')::bigint,
    count(*) FILTER (WHERE status = 'delivered')::bigint,
    count(*) FILTER (WHERE status = 'bounced')::bigint,
    count(*) FILTER (WHERE status = 'dropped')::bigint,
    count(*) FILTER (WHERE status = 'blocked')::bigint,
    count(*) FILTER (WHERE status = 'skipped')::bigint,
    count(*) FILTER (WHERE opened_at IS NOT NULL)::bigint,
    count(*) FILTER (WHERE clicked_at IS NOT NULL)::bigint
  FROM competitor_announcement_recipients
  WHERE campaign_id = p_campaign_id;
$$;

-- 3. Backfill: transition existing stuck 'queued' → 'unconfirmed' for dispatched campaigns
UPDATE public.competitor_announcement_recipients r
SET status = 'unconfirmed', updated_at = now()
FROM public.competitor_announcement_campaigns c
WHERE r.campaign_id = c.id
  AND r.status = 'queued'
  AND c.status = 'sending';

-- 4. Finalize any 'sending' campaigns that now have zero non-terminal recipients
UPDATE public.competitor_announcement_campaigns
SET status = 'sent', completed_at = now()
WHERE status = 'sending'
  AND NOT EXISTS (
    SELECT 1 FROM public.competitor_announcement_recipients r
    WHERE r.campaign_id = competitor_announcement_campaigns.id
      AND r.status NOT IN ('unconfirmed', 'delivered', 'bounced', 'dropped', 'blocked', 'skipped', 'failed')
  );
