-- [ULTRA-ROBUST] Full UI Restoration + Single Source of Truth (REPAIRED & ENHANCED)
CREATE OR REPLACE FUNCTION public.refresh_site_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
  v_member_count int;
  v_pwa_count int;
  v_push_count int;
  v_reg_total int;
  v_event_avg numeric;
  v_top_day text;
  v_monthly_stats jsonb;
  v_total_weekly jsonb;
  v_monthly_weekly jsonb;
  v_top_genres jsonb;
  v_now timestamptz := now();
  v_kr_now timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_days_passed int := extract(day from v_kr_now)::int;
  v_final_output jsonb;
BEGIN
  -- 1. Base Metrics
  SELECT count(*) INTO v_member_count FROM public.board_users;
  SELECT count(distinct user_id) INTO v_pwa_count FROM public.pwa_installs WHERE user_id IS NOT NULL;
  SELECT count(distinct user_id) INTO v_push_count FROM public.user_push_subscriptions WHERE user_id IS NOT NULL;
  SELECT count(*) INTO v_reg_total FROM public.events WHERE category NOT IN ('notice', 'notice_popup', 'board');

  -- 2. Performance Tracking
  WITH individual_dates AS (
    -- Multi-day events (from event_dates jsonb array)
    SELECT 
      to_char(d::date, 'YYYY-MM') as month_key,
      (extract(dow FROM d::date)::int) as dow,
      category, group_id, genre, title, d::date as activity_date,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as reg_date,
      created_at
    FROM public.events, jsonb_array_elements_text(coalesce(event_dates, '[]'::jsonb)) d
    WHERE category NOT IN ('notice', 'notice_popup', 'board') AND day_of_week IS NULL
    UNION ALL
    -- Single-day events (from start_date or date)
    SELECT 
      to_char(coalesce(start_date::date, date::date), 'YYYY-MM') as month_key,
      (extract(dow FROM coalesce(start_date::date, date::date))::int) as dow,
      category, group_id, genre, title, coalesce(start_date::date, date::date) as activity_date,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as reg_date,
      created_at
    FROM public.events
    WHERE category NOT IN ('notice', 'notice_popup', 'board') AND day_of_week IS NULL
    AND (event_dates IS NULL OR jsonb_array_length(event_dates) = 0)
    AND (start_date IS NOT NULL OR date IS NOT NULL)
  ),
  aggregated_monthly AS (
    SELECT month_key,
      sum(case when category = 'class' then 1 else 0 end) as classes,
      sum(case when category = 'club' or group_id is not null then 1 else 0 end) as socials,
      sum(case when category not in ('class', 'club') and group_id is null then 1 else 0 end) as events,
      count(*) as total
    FROM individual_dates GROUP BY month_key
  ),
  registrations_monthly AS (
     SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') as month_key, count(*) as reg_count
     FROM public.events 
     WHERE category NOT IN ('notice', 'notice_popup', 'board') 
     GROUP BY 1
  ),
  monthly_final AS (
    SELECT a.month_key as "month", a.classes, a.events, a.socials, coalesce(r.reg_count, 0) as registrations, a.total,
      CASE WHEN a.month_key = to_char(v_kr_now, 'YYYY-MM') THEN round(a.total::numeric / greatest(1, v_days_passed), 1) ELSE round(a.total::numeric / 30.4, 1) END as "dailyAvg"
    FROM aggregated_monthly a LEFT JOIN registrations_monthly r ON a.month_key = r.month_key
  ),
  weekly_stats_base AS (
    SELECT 
      dow, is_monthly, count(*) as c,
      sum(case when category='class' then 1 else 0 end) as classes,
      sum(case when category='club' or group_id is not null then 1 else 0 end) as socials,
      sum(case when category not in ('class', 'club') and group_id is null then 1 else 0 end) as events,
      jsonb_agg(jsonb_build_object(
        'title', title, 'type', (case when category='class' then '강습' when category='club' or group_id is not null then '동호회 이벤트+소셜' else '행사' end),
        'genre', coalesce(genre, ''), 'date', coalesce(to_char(activity_date, 'YYYY-MM-DD'), '-'), 'createdAt', reg_date
      ) ORDER BY coalesce(activity_date, '2000-01-01'::date) DESC) as items_list
    FROM (
      SELECT *, (coalesce(activity_date, created_at::date) >= (v_kr_now::date - interval '1 month')) as is_monthly FROM individual_dates
    ) sub GROUP BY dow, is_monthly
  ),
  genres_raw AS (
    SELECT genre, count(*) as c FROM individual_dates WHERE genre IS NOT NULL AND genre <> '' AND genre <> '기타' GROUP BY genre ORDER BY c DESC
  )
  SELECT 
    (SELECT jsonb_agg(m) FROM (SELECT * FROM monthly_final ORDER BY "month" ASC) m),
    (SELECT jsonb_agg(w) FROM (
      SELECT CASE dow WHEN 0 THEN '일' WHEN 1 THEN '월' WHEN 2 THEN '화' WHEN 3 THEN '수' WHEN 4 THEN '목' WHEN 5 THEN '금' WHEN 6 THEN '토' END as day,
             count(*) as count,
             jsonb_build_array(
               jsonb_build_object('name','강습','count',sum(case when item->>'type' = '강습' then 1 else 0 end)),
               jsonb_build_object('name','행사','count',sum(case when item->>'type' = '행사' then 1 else 0 end)),
               jsonb_build_object('name','동호회 이벤트+소셜','count',sum(case when item->>'type' = '동호회 이벤트+소셜' then 1 else 0 end))
             ) as "typeBreakdown",
             -- Recalculate daily genre breakdown
             (SELECT jsonb_agg(gb) FROM (
                SELECT genre as name, count(*) as count FROM individual_dates id2 
                WHERE id2.dow = w_outer.dow AND genre IS NOT NULL AND genre <> ''
                GROUP BY genre ORDER BY count DESC LIMIT 8
             ) gb) as "genreBreakdown",
             -- Top Genre
             (SELECT genre FROM individual_dates id3 WHERE id3.dow = w_outer.dow AND genre IS NOT NULL AND genre <> '' GROUP BY genre ORDER BY count(*) DESC LIMIT 1) as "topGenre",
             jsonb_agg(item) as items 
      FROM weekly_stats_base w_outer, jsonb_array_elements(items_list) as item GROUP BY dow ORDER BY (dow + 6) % 7
    ) w),
    (SELECT jsonb_agg(w) FROM (
      SELECT CASE dow WHEN 0 THEN '일' WHEN 1 THEN '월' WHEN 2 THEN '화' WHEN 3 THEN '수' WHEN 4 THEN '목' WHEN 5 THEN '금' WHEN 6 THEN '토' END as day,
             count(*) as count,
             jsonb_build_array(
               jsonb_build_object('name','강습','count',sum(case when item->>'type' = '강습' then 1 else 0 end)),
               jsonb_build_object('name','행사','count',sum(case when item->>'type' = '행사' then 1 else 0 end)),
               jsonb_build_object('name','동호회 이벤트+소셜','count',sum(case when item->>'type' = '동호회 이벤트+소셜' then 1 else 0 end))
             ) as "typeBreakdown",
             (SELECT jsonb_agg(gb) FROM (
                SELECT genre as name, count(*) as count FROM individual_dates id2 
                WHERE id2.dow = w_outer.dow AND genre IS NOT NULL AND genre <> ''
                AND (coalesce(activity_date, created_at::date) >= (v_kr_now::date - interval '1 month'))
                GROUP BY genre ORDER BY count DESC LIMIT 8
             ) gb) as "genreBreakdown",
             (SELECT genre FROM individual_dates id3 WHERE id3.dow = w_outer.dow AND genre IS NOT NULL AND genre <> '' AND (coalesce(activity_date, created_at::date) >= (v_kr_now::date - interval '1 month')) GROUP BY genre ORDER BY count(*) DESC LIMIT 1) as "topGenre",
             jsonb_agg(item) as items 
      FROM weekly_stats_base w_outer, jsonb_array_elements(items_list) as item WHERE is_monthly GROUP BY dow ORDER BY (dow + 6) % 7
    ) w),
    (SELECT jsonb_agg(genre) FROM (SELECT genre FROM genres_raw LIMIT 20) g)
  INTO v_monthly_stats, v_total_weekly, v_monthly_weekly, v_top_genres;

  -- 3. Summary & Final Assembly
  v_top_day := (SELECT day FROM jsonb_to_recordset(v_total_weekly) as x(day text, count int) ORDER BY count DESC LIMIT 1);
  v_event_avg := coalesce((SELECT "dailyAvg" FROM jsonb_to_recordset(v_monthly_stats) AS x("month" text, "dailyAvg" numeric) WHERE "month" = to_char(v_kr_now, 'YYYY-MM')), 0);

  v_final_output := jsonb_build_object(
    'summary', jsonb_build_object(
      'totalItems', v_reg_total,
      'dailyAverage', v_event_avg,
      'topDay', coalesce(v_top_day, '-'),
      'memberCount', v_member_count, 'pwaCount', v_pwa_count, 'pushCount', v_push_count, 'calculatedAt', v_now
    ),
    'monthly', coalesce(v_monthly_stats, '[]'::jsonb),
    'totalWeekly', coalesce(v_total_weekly, '[]'::jsonb),
    'monthlyWeekly', coalesce(v_monthly_weekly, '[]'::jsonb),
    'topGenresList', coalesce(v_top_genres, '[]'::jsonb)
  );

  -- 4. Cache Update
  INSERT INTO public.metrics_cache (key, value, updated_at) VALUES ('layout_summary', (v_final_output->'summary'), v_now)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

  INSERT INTO public.metrics_cache (key, value, updated_at) VALUES ('scene_analytics', v_final_output, v_now)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

  RETURN v_final_output;
END;
$BODY$;
