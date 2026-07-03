-- Work Based Learning Hours: per-(student, segment, activity) engagement-time estimate.
-- On-Demand: sessionize source='odl' solves per canonical challenge type
--   (gap > p_gap_minutes starts a new session; >=2 solves => (last-first)+p_tail_minutes; orphan => p_orphan_minutes).
-- Flash CTF: any solves (>0) in an event => full window (Mayors => p_ctf_mayors_minutes, else p_ctf_regular_minutes).
-- Windows are rule-based because game_platform_flash_ctf_events.ended_at is not recorded.
CREATE OR REPLACE FUNCTION public.get_work_based_learning_hours(
  p_synced_user_ids text[],
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_gap_minutes int DEFAULT 30,
  p_tail_minutes int DEFAULT 10,
  p_orphan_minutes int DEFAULT 15,
  p_ctf_regular_minutes int DEFAULT 120,
  p_ctf_mayors_minutes int DEFAULT 210,
  p_mayors_name text DEFAULT 'Inland Empire Mayors Cyber Cup 2026'
)
RETURNS TABLE (
  synced_user_id text,
  segment text,
  activity text,
  solves int,
  sessions int,
  minutes int
)
LANGUAGE sql
STABLE
AS $$
  WITH odl AS (
    SELECT s.synced_user_id,
      CASE lower(replace(s.challenge_category, ' ', '_'))
        WHEN 'recon' THEN 'Reconnaissance'
        WHEN 'reconnaissance' THEN 'Reconnaissance'
        WHEN 'webex' THEN 'Web Exploitation'
        WHEN 'web_exploitation' THEN 'Web Exploitation'
        WHEN 'binary_exploitation' THEN 'Binary Exploitation'
        WHEN 'cryptography' THEN 'Cryptography'
        WHEN 'forensics' THEN 'Forensics'
        WHEN 'miscellaneous' THEN 'Miscellaneous'
        WHEN 'operating_systems' THEN 'Operating Systems'
        WHEN 'osint' THEN 'OSINT'
        WHEN 'other' THEN 'Other'
        WHEN 'reverse_engineering' THEN 'Reverse Engineering'
        WHEN 'social' THEN 'Social'
        ELSE initcap(replace(s.challenge_category, '_', ' '))
      END AS category,
      s.solved_at
    FROM public.game_platform_challenge_solves s
    WHERE s.synced_user_id = ANY(p_synced_user_ids)
      AND s.source = 'odl'
      AND s.solved_at IS NOT NULL
      AND (p_start IS NULL OR s.solved_at >= p_start)
      AND (p_end IS NULL OR s.solved_at < p_end)
  ),
  flagged AS (
    SELECT o.synced_user_id, o.category, o.solved_at,
      CASE
        WHEN lag(o.solved_at) OVER w IS NULL
          OR o.solved_at - lag(o.solved_at) OVER w > make_interval(mins => p_gap_minutes)
        THEN 1 ELSE 0
      END AS new_sess
    FROM odl o
    WINDOW w AS (PARTITION BY o.synced_user_id, o.category ORDER BY o.solved_at)
  ),
  sessioned AS (
    SELECT f.synced_user_id, f.category, f.solved_at,
      sum(f.new_sess) OVER (PARTITION BY f.synced_user_id, f.category ORDER BY f.solved_at ROWS UNBOUNDED PRECEDING) AS sess_no
    FROM flagged f
  ),
  sess AS (
    SELECT x.synced_user_id, x.category, x.sess_no,
      count(*) AS n,
      CASE
        WHEN count(*) >= 2
          THEN EXTRACT(EPOCH FROM (max(x.solved_at) - min(x.solved_at))) / 60.0 + p_tail_minutes
        ELSE p_orphan_minutes
      END AS mins
    FROM sessioned x
    GROUP BY x.synced_user_id, x.category, x.sess_no
  ),
  odl_rows AS (
    SELECT s.synced_user_id,
      'On-Demand'::text AS segment,
      s.category AS activity,
      sum(s.n)::int AS solves,
      count(*)::int AS sessions,
      round(sum(s.mins))::int AS minutes
    FROM sess s
    GROUP BY s.synced_user_id, s.category
  ),
  ctf_rows AS (
    SELECT e.synced_user_id,
      'Flash CTF'::text AS segment,
      CASE
        WHEN e.flash_ctf_name = p_mayors_name THEN e.flash_ctf_name || ' (3.5 h)'
        ELSE regexp_replace(e.flash_ctf_name, '^MetaCTF ', '') || ' (2 h)'
      END AS activity,
      e.challenges_solved::int AS solves,
      1 AS sessions,
      CASE WHEN e.flash_ctf_name = p_mayors_name THEN p_ctf_mayors_minutes ELSE p_ctf_regular_minutes END AS minutes
    FROM public.game_platform_flash_ctf_events e
    WHERE e.synced_user_id = ANY(p_synced_user_ids)
      AND e.challenges_solved > 0
      AND (p_start IS NULL OR e.started_at >= p_start)
      AND (p_end IS NULL OR e.started_at < p_end)
  )
  SELECT * FROM odl_rows
  UNION ALL
  SELECT * FROM ctf_rows
$$;

GRANT EXECUTE ON FUNCTION public.get_work_based_learning_hours(text[], timestamptz, timestamptz, int, int, int, int, int, text)
  TO authenticated, service_role;
