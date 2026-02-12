-- [월간 빌보드 해결안] 이 SQL을 Supabase SQL Editor에서 실행해 주세요.
-- CLI 검증 완료: events(start_date, created_at), social_schedules(date, created_at)

-- 파라미터 이름 변경을 위해 기존 함수 먼저 삭제 (필수)
DROP FUNCTION IF EXISTS public.get_monthly_webzine_stats(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_monthly_webzine_stats(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
 AS $$
DECLARE
    result json;
BEGIN
    WITH meta_stats AS (
        -- 일반 유효 사용자 로그만 집계 (site_analytics_logs 테이블 직접 참조)
        SELECT 
            COUNT(*) as total_logs,
            COUNT(DISTINCT fingerprint) as unique_visitors
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
    ),
    hourly_agg AS (
        -- 시간대별 강습/행사 분류
        SELECT 
            extract(hour from created_at AT TIME ZONE 'Asia/Seoul') as agg_hour,
            COUNT(*) FILTER (WHERE target_type IN ('class', 'board_post', 'viewAll-classes')) as c_count,
            COUNT(*) FILTER (WHERE target_type IN ('event', 'social', 'social_schedule', 'social_regular', 'club_lesson', 'viewAll-events', 'group')) as e_count
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    daily_traffic AS (
        -- 요일별 순 방문자
        SELECT 
            extract(dow from created_at) as agg_dow,
            COUNT(DISTINCT fingerprint) as ct
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
        GROUP BY 1
    ),
    top_ranking AS (
        -- 상위 랭킹 (site_analytics_logs 기반)
        SELECT 
            target_type as t,
            target_id as tid,
            target_title as title,
            COUNT(*) as cnt
        FROM public.site_analytics_logs
        WHERE created_at >= p_start_date AND created_at <= p_end_date
          AND is_admin = FALSE
          AND target_type IN ('event', 'class', 'social', 'social_schedule', 'board_post', 'social_regular', 'club_lesson')
          AND target_title IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY 4 DESC
        LIMIT 30
    ),
    type_distribution AS (
        -- 전체 타입 분포 집계
        SELECT 
            json_object_agg(target_type, type_count) as dist
        FROM (
            SELECT target_type, COUNT(*) as type_count
            FROM public.site_analytics_logs
            WHERE created_at >= p_start_date AND created_at <= p_end_date
              AND is_admin = FALSE
            GROUP BY target_type
        ) t
    ),
    lead_time_calc AS (
        -- 리드타임 계산 (실제 DB 컬럼 기반 연산)
        WITH ev_hits AS (
             SELECT target_id, COUNT(*) as v_count
             FROM public.site_analytics_logs
             WHERE created_at >= p_start_date AND created_at <= p_end_date
               AND is_admin = FALSE
               AND target_type IN ('event', 'class', 'social_schedule', 'social')
             GROUP BY 1
        ),
        all_activities AS (
            -- Events & Classes (DB 컬럼: created_at, start_date)
            -- 타입 불일치 방지를 위해 명시적 캐스팅(::date) 추가
            SELECT 
                id::text as id, category, title, created_at, 
                COALESCE(start_date::date, date::date) as activity_date,
                (category ilike '%class%' OR title ilike '%강습%') as is_class
            FROM public.events
            WHERE COALESCE(start_date::date, date::date) IS NOT NULL
            UNION ALL
            -- Social Schedules (DB 컬럼: created_at, date)
            SELECT 
                id::text as id, 'social' as category, title, created_at, 
                date::date as activity_date,
                FALSE as is_class
            FROM public.social_schedules
            WHERE date IS NOT NULL
        ),
        ev_stats AS (
            SELECT 
                a.is_class, a.title, a.created_at as cat, a.activity_date as sdt,
                COALESCE(lh.v_count, 0) as views,
                extract(day from (a.activity_date::timestamp - a.created_at::timestamp)) as diff
            FROM all_activities a
            LEFT JOIN ev_hits lh ON a.id = lh.target_id
        )
        SELECT 
            -- 강습 구간 분석
            COALESCE(AVG(views) FILTER (WHERE is_class AND diff >= 21), 0) as c_early,
            COALESCE(AVG(views) FILTER (WHERE is_class AND diff >= 7 AND diff < 21), 0) as c_mid,
            COALESCE(AVG(views) FILTER (WHERE is_class AND diff < 7), 0) as c_late,
            -- 행사/소셜 구간 분석
            COALESCE(AVG(views) FILTER (WHERE NOT is_class AND diff >= 35), 0) as e_early,
            COALESCE(AVG(views) FILTER (WHERE NOT is_class AND diff >= 14 AND diff < 35), 0) as e_mid,
            COALESCE(AVG(views) FILTER (WHERE NOT is_class AND diff < 14), 0) as e_late
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
                'classEarly', ROUND(c_early::numeric, 1),
                'classMid', ROUND(c_mid::numeric, 1),
                'classLate', ROUND(c_late::numeric, 1),
                'eventEarly', ROUND(e_early::numeric, 1),
                'eventMid', ROUND(e_mid::numeric, 1),
                'eventLate', ROUND(e_late::numeric, 1)
            ) FROM lead_time_calc
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- 호출 권한 부여
GRANT EXECUTE ON FUNCTION public.get_monthly_webzine_stats TO authenticated, anon;
