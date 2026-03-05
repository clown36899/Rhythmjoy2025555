-- [CLEANUP] Remove day_of_week entirely - recurring schedule feature is not used.
-- All events are one-time (date-based). Only 당일/개별 registration is supported.

-- 1. Drop day_of_week column from events table
ALTER TABLE public.events DROP COLUMN IF EXISTS day_of_week;

-- 2. Fix refresh_site_stats_index() - remove day_of_week IS NULL filter that was blocking all events from stats
CREATE OR REPLACE FUNCTION public.refresh_site_stats_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
  v_kr_now timestamptz := now() AT TIME ZONE 'Asia/Seoul';
BEGIN
  -- Clear existing data
  TRUNCATE TABLE public.site_stats_index;

  -- 1. Activity Counts (Based on start_date or event_dates)
  INSERT INTO public.site_stats_index (ref_date, metric_type, dim_cat, dim_genre, dim_venue, val)
  WITH individual_dates AS (
    SELECT
      d::date as activity_date,
      (CASE
        WHEN category = 'class' THEN 'class'
        WHEN category IN ('club', 'social') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
      END) as cat,
      coalesce(nullif(genre, ''), '기타') as genre,
      venue_id::text,
      1 as val
    FROM public.events, jsonb_array_elements_text(coalesce(event_dates, '[]'::jsonb)) d
    WHERE category NOT IN ('notice', 'notice_popup', 'board')
    UNION ALL
    SELECT
      coalesce(start_date::date, date::date) as activity_date,
      (CASE
        WHEN category = 'class' THEN 'class'
        WHEN category IN ('club', 'social') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
      END) as cat,
      coalesce(nullif(genre, ''), '기타') as genre,
      venue_id::text,
      1 as val
    FROM public.events
    WHERE category NOT IN ('notice', 'notice_popup', 'board')
    AND (event_dates IS NULL OR jsonb_array_length(event_dates) = 0)
    AND (start_date IS NOT NULL OR date IS NOT NULL)
  )
  SELECT
    activity_date,
    'act_count',
    cat,
    genre,
    venue_id,
    sum(val)
  FROM individual_dates
  GROUP BY activity_date, cat, genre, venue_id;

  -- 2. Registration Counts (Based on created_at)
  INSERT INTO public.site_stats_index (ref_date, metric_type, dim_cat, dim_genre, dim_venue, val)
  SELECT
    (created_at AT TIME ZONE 'Asia/Seoul')::date as reg_date,
    'reg_count',
    (CASE
        WHEN category = 'class' THEN 'class'
        WHEN category IN ('club', 'social') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
    END) as cat,
    coalesce(nullif(genre, ''), '기타') as genre,
    venue_id::text,
    count(*)
  FROM public.events
  WHERE category NOT IN ('notice', 'notice_popup', 'board')
  GROUP BY 1, 3, 4, 5;

  -- 3. Live Snapshots (User, PWA, Push)
  INSERT INTO public.site_stats_index (ref_date, metric_type, dim_cat, dim_genre, val)
  SELECT v_kr_now::date, 'user_count', 'total', 'None', count(*) FROM public.board_users;

  INSERT INTO public.site_stats_index (ref_date, metric_type, dim_cat, dim_genre, val)
  SELECT v_kr_now::date, 'pwa_count', 'total', 'None', count(distinct user_id)
  FROM public.pwa_installs WHERE user_id IS NOT NULL;

  INSERT INTO public.site_stats_index (ref_date, metric_type, dim_cat, dim_genre, val)
  SELECT v_kr_now::date, 'push_count', 'total', 'None', count(distinct user_id)
  FROM public.user_push_subscriptions WHERE user_id IS NOT NULL;

END;
$BODY$;
