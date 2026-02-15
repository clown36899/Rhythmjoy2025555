-- [PROMO STATS REFACTOR] Index-based Lead Time Analysis
-- 1. Extend Index Schema
ALTER TABLE public.site_stats_index ADD COLUMN IF NOT EXISTS reg_date DATE;

-- 2. Update Refresh Function (refresh_site_stats_index)
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
        WHEN category IN ('club', 'social', 'club_lesson') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
      END) as cat,
      coalesce(nullif(genre, ''), '기타') as genre,
      venue_id::text,
      1 as val
    FROM public.events, jsonb_array_elements_text(coalesce(event_dates, '[]'::jsonb)) d
    WHERE category != 'board' AND day_of_week IS NULL
    UNION ALL
    SELECT 
      coalesce(start_date::date, date::date) as activity_date,
      (CASE 
        WHEN category = 'class' THEN 'class'
        WHEN category IN ('club', 'social', 'club_lesson') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
      END) as cat,
      coalesce(nullif(genre, ''), '기타') as genre,
      venue_id::text,
      1 as val
    FROM public.events
    WHERE category != 'board' AND day_of_week IS NULL
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
        WHEN category IN ('club', 'social', 'club_lesson') OR group_id IS NOT NULL THEN 'social'
        ELSE 'event'
    END) as cat,
    coalesce(nullif(genre, ''), '기타') as genre,
    venue_id::text,
    count(*)
  FROM public.events
  WHERE category != 'board'
  GROUP BY 1, 3, 4, 5;

  -- 3. Promo Stats (Views per Event for Lead Time Analysis)
  -- Store EACH event's view count based on its Start Date (ref_date) and Created At (reg_date)
  INSERT INTO public.site_stats_index (ref_date, reg_date, metric_type, dim_cat, dim_genre, val)
  WITH event_views AS (
      SELECT 
          target_id, count(*) as v_count
      FROM public.site_analytics_logs
      WHERE target_type IN ('event', 'class', 'social', 'club_lesson', 'group') -- Broad Include
      GROUP BY 1
  )
  SELECT 
      COALESCE(e.start_date::date, e.date::date) as activity_date,
      (e.created_at AT TIME ZONE 'Asia/Seoul')::date as created_date,
      'promo_stat' as metric_type,
      (CASE 
          WHEN e.category = 'class' OR e.title LIKE '%강습%' OR e.title LIKE '%모집%' THEN 'class'
          ELSE 'event' 
      END) as dim_cat,
      'N/A' as dim_genre, -- Lead Time is calculated dynamically from dates
      COALESCE(ev.v_count, 0) as val
  FROM public.events e
  LEFT JOIN event_views ev ON e.id::text = ev.target_id
  WHERE e.category != 'board' 
    AND (e.start_date IS NOT NULL OR e.date IS NOT NULL)
    AND e.created_at IS NOT NULL;


  -- 4. Live Snapshots (User, PWA, Push)
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

-- 3. Update Getter Function to use Index for Lead Time
CREATE OR REPLACE FUNCTION public.get_monthly_webzine_stats(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
DECLARE
    result json;
BEGIN
    WITH meta_stats AS (
        SELECT 
            COUNT(*) as total_logs,
            COUNT(DISTINCT fingerprint) as unique_visitors
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
    ),
    hourly_agg AS (
        SELECT 
            extract(hour from created_at AT TIME ZONE 'Asia/Seoul') as agg_hour,
            COUNT(*) FILTER (WHERE target_type IN ('class', 'board_post', 'viewAll-classes')) as c_count,
            COUNT(*) FILTER (WHERE target_type != 'class' AND target_type != 'board_post' AND target_type != 'viewAll-classes') as e_count
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    daily_traffic AS (
        SELECT 
            extract(dow from created_at) as agg_dow,
            COUNT(DISTINCT fingerprint) as ct
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    top_ranking AS (
        SELECT 
            target_type as t,
            target_id as tid,
            target_title as title,
            COUNT(*) as cnt
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
          AND target_type != 'nav_item'
          AND target_title IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY 4 DESC
        LIMIT 30
    ),
    type_distribution AS (
        SELECT json_object_agg(target_type, type_count) as dist
        FROM (
            SELECT target_type, COUNT(*) as type_count
            FROM public.site_analytics_logs
            WHERE created_at >= p_start_date AND created_at <= p_end_date
              AND is_admin = FALSE
            GROUP BY target_type
        ) t
    ),
    -- [UPDATED] Lead Time Calc from Index
    lead_time_calc AS (
        WITH promo_data AS (
            SELECT 
                dim_cat, 
                val as views,
                (ref_date - reg_date) as lead_days
            FROM public.site_stats_index
            WHERE metric_type = 'promo_stat'
              AND ref_date >= p_start_date::date 
              AND ref_date <= p_end_date::date
        )
        SELECT 
            -- Class
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'class' AND lead_days >= 21), 0) as c_early,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'class' AND lead_days >= 7 AND lead_days < 21), 0) as c_mid,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'class' AND lead_days < 7), 0) as c_late,
            -- Event
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'event' AND lead_days >= 35), 0) as e_early,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'event' AND lead_days >= 14 AND lead_days < 35), 0) as e_mid,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'event' AND lead_days < 14), 0) as e_late
        FROM promo_data
    )
    SELECT json_build_object(
        'meta', (SELECT json_build_object('totalLogs', total_logs, 'uniqueVisitors', unique_visitors, 'distribution', (SELECT dist FROM type_distribution)) FROM meta_stats),
        'hourlyStats', (SELECT json_agg(json_build_object('hour', h.hour_num, 'class_count', COALESCE(ha.c_count, 0), 'event_count', COALESCE(ha.e_count, 0))) FROM (SELECT generate_series(0,23) as hour_num) h LEFT JOIN hourly_agg ha ON h.hour_num = ha.agg_hour),
        'dailyTraffic', (SELECT json_agg(json_build_object('day', d.dw_num, 'count', COALESCE(dt.ct, 0))) FROM (SELECT generate_series(0,6) as dw_num) d LEFT JOIN daily_traffic dt ON d.dw_num = dt.agg_dow),
        'topContents', (SELECT json_agg(json_build_object('type', t, 'id', tid, 'title', title, 'count', cnt)) FROM top_ranking),
        'leadTime', (SELECT json_build_object(
                'classEarly', ROUND(c_early::numeric, 1), 'classMid', ROUND(c_mid::numeric, 1), 'classLate', ROUND(c_late::numeric, 1),
                'eventEarly', ROUND(e_early::numeric, 1), 'eventMid', ROUND(e_mid::numeric, 1), 'eventLate', ROUND(e_late::numeric, 1)
            ) FROM lead_time_calc)
    ) INTO result;

    RETURN result;
END;
$$;
