-- [월간 빌보드 해결안] 이 SQL을 Supabase SQL Editor에서 실행해 주세요.

CREATE OR REPLACE FUNCTION public.get_monthly_webzine_stats(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 AS $$
DECLARE
    result json;
BEGIN
    WITH meta_stats AS (
        -- 일반 유효 사용자 로그만 집계
        SELECT 
            COUNT(*) as total_logs,
            COUNT(DISTINCT fingerprint) as unique_visitors
        FROM public.site_analytics_logs
        WHERE created_at >= start_date AND created_at <= end_date
          AND is_admin = FALSE
    ),
    hourly_agg AS (
        -- 시간대별 강습/행사 분류 (타입 확장)
        SELECT 
            extract(hour from created_at AT TIME ZONE 'Asia/Seoul') as agg_hour,
            COUNT(*) FILTER (WHERE target_type IN ('class', 'board_post', 'viewAll-classes')) as c_count,
            COUNT(*) FILTER (WHERE target_type IN ('event', 'social', 'social_schedule', 'social_regular', 'club_lesson', 'viewAll-events', 'group')) as e_count
        FROM public.site_analytics_logs
        WHERE created_at >= start_date AND created_at <= end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    daily_traffic AS (
        -- 요일별 순 방문자
        SELECT 
            extract(dow from created_at) as agg_dow,
            COUNT(DISTINCT fingerprint) as ct
        FROM public.site_analytics_logs
        WHERE created_at >= start_date AND created_at <= end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    top_ranking AS (
        -- 상목 상위 랭킹 (검색된 모든 유효 실활동 타입 포함)
        SELECT 
            target_type as t,
            target_id as tid,
            target_title as title,
            COUNT(*) as cnt
        FROM public.site_analytics_logs
        WHERE created_at >= start_date AND created_at <= end_date
          AND is_admin = FALSE
          AND target_type IN ('event', 'class', 'social', 'social_schedule', 'board_post', 'social_regular', 'club_lesson')
          AND target_title IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY 4 DESC
        LIMIT 30
    ),
    type_distribution AS (
        -- [분석용] 전체 타입 분포 집계 (누락 데이터 확인용)
        SELECT 
            json_object_agg(target_type, type_count) as dist
        FROM (
            SELECT target_type, COUNT(*) as type_count
            FROM public.site_analytics_logs
            WHERE created_at >= start_date AND created_at <= end_date
              AND is_admin = FALSE
            GROUP BY target_type
        ) t
    ),
    lead_time_calc AS (
        -- 리드타임 계산 (타입 캐스팅 및 조인 최적화)
        WITH ev_hits AS (
             SELECT target_id, COUNT(*) as v_count
             FROM public.site_analytics_logs
             WHERE created_at >= start_date AND created_at <= end_date
               AND is_admin = FALSE
               AND target_type IN ('event', 'class', 'social_schedule')
             GROUP BY 1
        ),
        ev_stats AS (
            SELECT 
                e.category, e.title, e.created_at as cat, e.start_date as sdt,
                COALESCE(lh.v_count, 0) as views,
                extract(day from (e.start_date::timestamp - e.created_at::timestamp)) as diff
            FROM public.events e
            JOIN ev_hits lh ON e.id::text = lh.target_id
        )
        SELECT 
            COALESCE(AVG(views) FILTER (WHERE (category ilike '%class%' OR title ilike '%강습%') AND diff >= 21), 0) as c_d28,
            COALESCE(AVG(views) FILTER (WHERE (category ilike '%class%' OR title ilike '%강습%') AND diff < 7), 0) as c_d7,
            COALESCE(AVG(views) FILTER (WHERE (category NOT ilike '%class%' AND title NOT ilike '%강습%') AND diff >= 35), 0) as e_d42,
            COALESCE(AVG(views) FILTER (WHERE (category NOT ilike '%class%' AND title NOT ilike '%강습%') AND diff < 14), 0) as e_d14
        FROM ev_stats
    )
    SELECT json_build_object(
        'meta', (
            SELECT json_build_object(
                'totalLogs', total_logs, 
                'uniqueVisitors', unique_visitors,
                'distribution', (SELECT dist FROM type_distribution)
            ) FROM meta_stats
        ),
        'hourlyStats', (
            SELECT json_agg(json_build_object('hour', h.hour_num, 'class_count', COALESCE(ha.c_count, 0), 'event_count', COALESCE(ha.e_count, 0)))
            FROM (SELECT generate_series(0,23) as hour_num) h
            LEFT JOIN hourly_agg ha ON h.hour_num = ha.agg_hour
        ),
        'dailyTraffic', (
            SELECT json_agg(json_build_object('day', d.dw_num, 'count', COALESCE(dt.ct, 0)))
            FROM (SELECT generate_series(0,6) as dw_num) d
            LEFT JOIN daily_traffic dt ON d.dw_num = dt.agg_dow
        ),
        'topContents', (
            SELECT json_agg(json_build_object('type', t, 'id', tid, 'title', title, 'count', cnt))
            FROM top_ranking
        ),
        'leadTime', (
            SELECT json_build_object(
                'classD28', ROUND(c_d28::numeric, 1),
                'classD7', ROUND(c_d7::numeric, 1),
                'eventD42', ROUND(e_d42::numeric, 1),
                'eventD14', ROUND(e_d14::numeric, 1)
            ) FROM lead_time_calc
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- 호출 권한 부여
GRANT EXECUTE ON FUNCTION public.get_monthly_webzine_stats TO authenticated, anon;
