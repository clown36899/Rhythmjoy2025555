


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."node_behavior" AS ENUM (
    'LEAF',
    'GROUP',
    'PORTAL'
);


ALTER TYPE "public"."node_behavior" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_admin"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can add new admins';
  END IF;
  
  INSERT INTO board_admins (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."add_admin"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."add_admin"("p_user_id" "uuid") IS '관리자 추가 (관리자만 가능)';



CREATE OR REPLACE FUNCTION "public"."check_is_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."check_is_admin"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_is_admin"("p_user_id" "uuid") IS '특정 사용자 관리자 체크 (board_admins UUID 기반)';



CREATE OR REPLACE FUNCTION "public"."check_post_dislikes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id) >= 20 THEN
        UPDATE public.board_posts SET is_hidden = true WHERE id = NEW.post_id;
    END IF;
    -- Also update the dislikes count in board_posts
    UPDATE public.board_posts 
    SET dislikes = (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id)
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_post_dislikes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_board_post"("p_title" "text", "p_content" "text", "p_author_name" "text", "p_user_id" "text", "p_author_nickname" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO board_posts (title, content, author_name, user_id, author_nickname)
  VALUES (p_title, p_content, p_author_name, p_user_id, p_author_nickname);
END;
$$;


ALTER FUNCTION "public"."create_board_post"("p_title" "text", "p_content" "text", "p_author_name" "text", "p_user_id" "text", "p_author_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_board_post"("p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_author_name" character varying, "p_author_nickname" character varying, "p_is_notice" boolean DEFAULT false, "p_prefix_id" integer DEFAULT NULL::integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
  v_is_admin BOOLEAN;
  v_prefix_admin_only BOOLEAN;
BEGIN
  -- 관리자 여부 확인
  v_is_admin := COALESCE((auth.jwt()->>'app_metadata')::jsonb->>'is_admin' = 'true', FALSE);

  -- prefix_id가 있으면 admin_only 여부 확인
  IF p_prefix_id IS NOT NULL THEN
    SELECT COALESCE(admin_only, FALSE) INTO v_prefix_admin_only
    FROM board_prefixes
    WHERE id = p_prefix_id;

    -- 관리자 전용 머릿말을 일반 사용자가 선택하려고 하면 에러
    IF COALESCE(v_prefix_admin_only, FALSE) = TRUE AND COALESCE(v_is_admin, FALSE) = FALSE THEN
      RAISE EXCEPTION '관리자 전용 머릿말입니다.';
    END IF;
  END IF;

  INSERT INTO board_posts (user_id, title, content, author_name, author_nickname, is_notice, prefix_id, views)
  VALUES (p_user_id, p_title, p_content, p_author_name, p_author_nickname, p_is_notice, p_prefix_id, 0)
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'author_name', author_name,
    'author_nickname', author_nickname,
    'is_notice', is_notice,
    'prefix_id', prefix_id,
    'views', views,
    'created_at', created_at
  ) INTO v_result;

  RETURN v_result::JSON;
END;
$$;


ALTER FUNCTION "public"."create_board_post"("p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_author_name" character varying, "p_author_nickname" character varying, "p_is_notice" boolean, "p_prefix_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_usage_snapshot"("p_logged_in" integer, "p_anonymous" integer, "p_admin" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF public.is_admin() THEN
        INSERT INTO public.site_usage_stats (logged_in_count, anonymous_count, total_count, admin_count)
        VALUES (p_logged_in, p_anonymous, p_logged_in + p_anonymous, p_admin);
    END IF;
END;
$$;


ALTER FUNCTION "public"."create_usage_snapshot"("p_logged_in" integer, "p_anonymous" integer, "p_admin" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_rows_deleted int;
BEGIN
    DELETE FROM public.board_anonymous_comments
    WHERE id = p_comment_id AND password = p_password;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RETURN v_rows_deleted > 0;
END;
$$;


ALTER FUNCTION "public"."delete_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Allow delete if user is admin OR if password matches
    IF public.is_admin_user() OR EXISTS (SELECT 1 FROM public.board_anonymous_posts WHERE id = p_post_id AND password = p_password) THEN
        -- Delete dependencies
        DELETE FROM public.board_anonymous_comments WHERE post_id = p_post_id;
        DELETE FROM public.board_anonymous_likes WHERE post_id = p_post_id;
        DELETE FROM public.board_anonymous_dislikes WHERE post_id = p_post_id;
        
        -- Delete the post
        DELETE FROM public.board_anonymous_posts WHERE id = p_post_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;


ALTER FUNCTION "public"."delete_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_post_with_password"("p_post_id" bigint, "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.board_posts WHERE id = p_post_id AND password = p_password) THEN
        -- Manually delete dependencies to prevent Foreign Key errors
        DELETE FROM public.board_comments WHERE post_id = p_post_id;
        DELETE FROM public.board_post_likes WHERE post_id = p_post_id;
        DELETE FROM public.board_post_dislikes WHERE post_id = p_post_id;
        
        -- Delete the post
        DELETE FROM public.board_posts WHERE id = p_post_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;


ALTER FUNCTION "public"."delete_post_with_password"("p_post_id" bigint, "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'member_count', (SELECT COUNT(*) FROM public.board_users),
        'pwa_count', (SELECT COUNT(*) FROM public.pwa_installs),
        'push_count', (SELECT COUNT(*) FROM public.user_push_subscriptions)
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_admin_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_board_users"() RETURNS TABLE("id" integer, "user_id" character varying, "nickname" character varying, "real_name" character varying, "phone" character varying, "gender" character varying, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  is_admin_flag TEXT;
BEGIN
  -- JWT의 app_metadata에서 is_admin 플래그 확인
  is_admin_flag := auth.jwt() -> 'app_metadata' ->> 'is_admin';
  
  -- 관리자가 아니면 에러 발생
  IF is_admin_flag IS NULL OR is_admin_flag != 'true' THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;
  
  -- 관리자 확인 완료 후 전체 회원 목록 반환
  RETURN QUERY
  SELECT 
    bu.id,
    bu.user_id,
    bu.nickname,
    bu.real_name,
    bu.phone,
    bu.gender,
    bu.created_at
  FROM board_users bu
  ORDER BY bu.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_board_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_analytics_summary_v2"("start_date" "text", "end_date" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result json;
  v_start timestamptz;
  v_end timestamptz;
  v_excluded_prefix text := '91b04b25'; -- Test Account Prefix
begin
  -- Convert text input to timestamptz
  v_start := start_date::timestamptz;
  v_end := end_date::timestamptz;

  with raw_data as (
    select
      user_id,
      fingerprint,
      created_at,
      -- Determine Identifier
      coalesce(user_id::text, fingerprint, 'unknown') as identifier,
      -- 6-Hour Bucket Calculation
      floor(extract(epoch from created_at) / (21600)) as time_bucket
    from site_analytics_logs
    where created_at >= v_start 
      and created_at <= v_end
      and is_admin = false
      -- [FIX] Exclude Test Account server-side
      and (user_id is null or user_id::text not like v_excluded_prefix || '%')
  ),
  -- Deduplicate
  deduped_visits as (
    select distinct on (identifier, time_bucket)
      user_id,
      fingerprint,
      created_at
    from raw_data
    order by identifier, time_bucket, created_at
  ),
  -- User Stats
  user_stats as (
    select
      user_id,
      count(*) as visit_count,
      array_agg(created_at order by created_at desc) as visit_logs
    from deduped_visits
    where user_id is not null
    group by user_id
  ),
  -- Session Duration Stats
  session_duration_stats as (
    select
      user_id,
      avg(duration_seconds) as avg_duration
    from session_logs
    where duration_seconds is not null
      and duration_seconds > 0
    group by user_id
  )
  select json_build_object(
    -- Global Counters
    'total_visits', (select count(*) from deduped_visits),
    'logged_in_visits', (select count(*) from deduped_visits where user_id is not null),
    'anonymous_visits', (select count(*) from deduped_visits where user_id is null),
    
    -- User List with Details
    'user_list', (
      select coalesce(json_agg(
        json_build_object(
          'user_id', us.user_id,
          'visitCount', us.visit_count,
          'visitLogs', us.visit_logs,
          'nickname', u.nickname,
          'avgDuration', coalesce(sd.avg_duration, 0)
        ) order by us.visit_count desc
      ), '[]'::json)
      from user_stats us
      left join board_users u on us.user_id::text = u.user_id::text
      left join session_duration_stats sd on us.user_id::text = sd.user_id::text
    )
  ) into result;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_analytics_summary_v2"("start_date" "text", "end_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_static_data"() RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    -- 1. Board Categories (Existing)
    'categories', COALESCE((
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT *
        FROM board_categories
        WHERE is_active = true
        ORDER BY display_order ASC
      ) c
    ), '[]'::json),

    -- 2. Board Prefixes (Existing)
    'prefixes', COALESCE((
      SELECT json_object_agg(
        bc.code,
        (
          SELECT json_agg(row_to_json(p))
          FROM (
            SELECT *
            FROM board_prefixes
            WHERE board_prefixes.board_category_code = bc.code
            ORDER BY display_order ASC
          ) p
        )
      )
      FROM board_categories bc
      WHERE bc.is_active = true
    ), '{}'::json),

    -- 3. Theme Settings (Existing)
    'theme_settings', COALESCE((
      SELECT row_to_json(t)
      FROM theme_settings t
      WHERE id = 1
    ), '{}'::json),

    -- 4. Billboard Settings (New)
    'billboard_settings', COALESCE((
       SELECT row_to_json(b)
       FROM billboard_settings b
       WHERE id = 1
    ), '{}'::json),

    -- 5. Practice Rooms (New - Lite version for Banner)
    'practice_rooms', COALESCE((
       SELECT json_agg(row_to_json(v))
       FROM (
          SELECT id, name, address, images, category, display_order, is_active
          FROM venues
          WHERE category = '연습실' AND is_active = true
          ORDER BY display_order ASC
       ) v
    ), '[]'::json),

     -- 6. Shops (New - Lite version for Banner)
    'shops', COALESCE((
       SELECT json_agg(row_to_json(s))
       FROM (
          SELECT 
            s.id, 
            s.name, 
            s.description, 
            s.logo_url, 
            s.website_url, 
            s.created_at,
            COALESCE((
              SELECT json_agg(fi)
              FROM featured_items fi
              WHERE fi.shop_id = s.id
            ), '[]'::json) as featured_items
          FROM shops s
          -- WHERE is_active = true -- Removed as column might not exist
          ORDER BY s.created_at DESC
       ) s
    ), '[]'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_board_static_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_board_user"("p_user_id" "text") RETURNS TABLE("nickname" "text", "real_name" "text", "phone" "text", "gender" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bu.nickname,
    bu.real_name,
    bu.phone,
    bu.gender,
    bu.created_at
  FROM board_users bu
  WHERE bu.user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."get_board_user"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bootstrap_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB;
BEGIN
  -- 각 테이블의 데이터를 서브쿼리로 조회하여 하나의 JSON 객체로 조립합니다.
  
  SELECT jsonb_build_object(
    -- 1. 게시판 카테고리
    'categories', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
      FROM (SELECT * FROM board_categories WHERE is_active = true ORDER BY display_order) t
    ),

    -- 2. 연습실 목록
    'venues', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
      FROM (SELECT * FROM venues WHERE category = '연습실' AND is_active = true) t
    ),

    -- 3. 쇼핑몰 목록 & 추천 아이템
    'shops', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
      FROM (
        SELECT s.*, 
          (SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) 
           FROM featured_items i 
           WHERE i.shop_id = s.id) as featured_items 
        FROM shops s 
        ORDER BY created_at DESC
      ) t
    ),

    -- 4. 빌보드 설정
    'billboard', (
      SELECT row_to_json(t) FROM (SELECT * FROM billboard_settings WHERE id = 1) t
    ),

    -- 5. 테마 설정
    'theme', (
      SELECT row_to_json(t) FROM (SELECT * FROM theme_settings WHERE id = 1) t
    ),

    -- 6. 소셜 일정
    'social_schedules', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
      FROM (SELECT * FROM social_schedules ORDER BY date ASC, start_time ASC) t
    ),

    -- 7. 앱 설정
    'genre_weights', (
      SELECT value FROM app_settings WHERE key = 'genre_weights'
    ),

    -- 8. 이벤트 장르 집계
    'events_genres', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) 
      FROM (SELECT genre, category FROM events WHERE genre IS NOT NULL) t
    )

  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_bootstrap_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_kakao_user_info"("p_kakao_id" "text") RETURNS TABLE("user_id" "uuid", "email" character varying, "nickname" "text", "profile_image" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bu.user_id::uuid,
    au.email::varchar,
    bu.nickname,
    bu.profile_image
  FROM public.board_users bu
  JOIN auth.users au ON bu.user_id::uuid = au.id
  WHERE bu.kakao_id = p_kakao_id
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_kakao_user_info"("p_kakao_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_webzine_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
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
            -- Class (Matching MonthlyBillboard Interface)
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'class' AND lead_days >= 28), 0) as c_d28,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'class' AND lead_days >= 7 AND lead_days < 28), 0) as c_d7,
            -- Event (Matching MonthlyBillboard Interface)
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'event' AND lead_days >= 42), 0) as e_d42,
            COALESCE(AVG(views) FILTER (WHERE dim_cat = 'event' AND lead_days >= 14 AND lead_days < 42), 0) as e_d14
        FROM promo_data
    )
    SELECT json_build_object(
        'meta', (SELECT json_build_object('totalLogs', total_logs, 'uniqueVisitors', unique_visitors, 'distribution', (SELECT dist FROM type_distribution)) FROM meta_stats),
        'hourlyStats', (SELECT json_agg(json_build_object('hour', h.hour_num, 'class_count', COALESCE(ha.c_count, 0), 'event_count', COALESCE(ha.e_count, 0))) FROM (SELECT generate_series(0,23) as hour_num) h LEFT JOIN hourly_agg ha ON h.hour_num = ha.agg_hour),
        'dailyTraffic', (SELECT json_agg(json_build_object('day', d.dw_num, 'count', COALESCE(dt.ct, 0))) FROM (SELECT generate_series(0,6) as dw_num) d LEFT JOIN daily_traffic dt ON d.dw_num = dt.agg_dow),
        'topContents', (SELECT json_agg(json_build_object('type', t, 'id', tid, 'title', title, 'count', cnt)) FROM top_ranking),
        'leadTime', (SELECT json_build_object(
                'classD28', ROUND(c_d28::numeric, 1), 'classD7', ROUND(c_d7::numeric, 1),
                'eventD42', ROUND(e_d42::numeric, 1), 'eventD14', ROUND(e_d14::numeric, 1)
            ) FROM lead_time_calc)
    ) INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_monthly_webzine_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_board_user"("p_user_id" character varying) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'id', id,
    'user_id', user_id,
    'nickname', nickname,
    'real_name', real_name,
    'phone', phone,
    'gender', gender,
    'created_at', created_at
  ) INTO v_result
  FROM board_users
  WHERE user_id = p_user_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_my_board_user"("p_user_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_table_constraints"("t_name" "text") RETURNS TABLE("constraint_name" "text", "constraint_type" "text", "table_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        conname::text,
        contype::text,
        relname::text
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = t_name;
END;
$$;


ALTER FUNCTION "public"."get_table_constraints"("t_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_admin_status"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."get_user_admin_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_admin_status"() IS '관리자 체크 (board_admins UUID 기반)';



CREATE OR REPLACE FUNCTION "public"."get_user_interactions"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'post_likes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_likes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'post_dislikes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_dislikes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'post_favorites', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'anonymous_post_likes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_anonymous_likes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'anonymous_post_dislikes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_anonymous_dislikes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'comment_likes', COALESCE((
      SELECT json_agg(comment_id) 
      FROM public.board_comment_likes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'comment_dislikes', COALESCE((
      SELECT json_agg(comment_id) 
      FROM public.board_comment_dislikes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'anonymous_comment_likes', COALESCE((
      SELECT json_agg(comment_id) 
      FROM public.board_anonymous_comment_likes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'anonymous_comment_dislikes', COALESCE((
      SELECT json_agg(comment_id) 
      FROM public.board_anonymous_comment_dislikes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'event_favorites', COALESCE((
      SELECT json_agg(event_id) 
      FROM public.event_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'social_group_favorites', COALESCE((
      SELECT json_agg(group_id) 
      FROM public.social_group_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'practice_room_favorites', COALESCE((
      SELECT json_agg(practice_room_id) 
      FROM public.practice_room_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'shop_favorites', COALESCE((
      SELECT json_agg(shop_id) 
      FROM public.shop_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_user_interactions"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_today_views"("target_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    today_views INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO today_views
    FROM site_analytics_logs
    WHERE 
        -- 접속 시간이 오늘(UTC 기준) 이후인 경우
        created_at >= (now() AT TIME ZONE 'UTC')::date
        
        -- 그리고 그 대상 ID가 해당 유저가 쓴 글(board_posts) 또는 행사(events)인 경우
        AND (
            (target_type = 'board_post' AND target_id IN (SELECT id::text FROM board_posts WHERE user_id = target_user_id))
            OR
            (target_type = 'event' AND target_id IN (SELECT id::text FROM events WHERE user_id = target_user_id))
        );
    
    RETURN COALESCE(today_views, 0);
END;
$$;


ALTER FUNCTION "public"."get_user_today_views"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_anonymous_mutual_dislike"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    DELETE FROM public.board_anonymous_likes 
    WHERE post_id = NEW.post_id AND user_id = NEW.user_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_anonymous_mutual_dislike"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_anonymous_mutual_like"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    DELETE FROM public.board_anonymous_dislikes 
    WHERE post_id = NEW.post_id AND user_id = NEW.user_id; 
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_anonymous_mutual_like"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_anonymous_mutual_like_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- No update logic needed for dislikes on like update usually, but just in case
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_anonymous_mutual_like_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_push_subscription"("p_endpoint" "text", "p_subscription" "jsonb", "p_user_agent" "text", "p_is_admin" boolean, "p_pref_events" boolean, "p_pref_class" boolean, "p_pref_clubs" boolean, "p_pref_filter_tags" "text"[], "p_pref_filter_class_genres" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.user_push_subscriptions (
        user_id, endpoint, subscription, user_agent, is_admin,
        pref_events, pref_class, pref_clubs, 
        pref_filter_tags, pref_filter_class_genres, updated_at
    )
    VALUES (
        v_user_id, p_endpoint, p_subscription, p_user_agent, p_is_admin,
        p_pref_events, p_pref_class, p_pref_clubs, 
        p_pref_filter_tags, p_pref_filter_class_genres, now()
    )
    ON CONFLICT (endpoint) 
    DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        subscription = EXCLUDED.subscription,
        user_agent = EXCLUDED.user_agent,
        is_admin = EXCLUDED.is_admin,
        pref_events = EXCLUDED.pref_events,
        pref_class = EXCLUDED.pref_class,
        pref_clubs = EXCLUDED.pref_clubs,
        pref_filter_tags = EXCLUDED.pref_filter_tags,
        pref_filter_class_genres = EXCLUDED.pref_filter_class_genres,
        updated_at = now();
END;
$$;


ALTER FUNCTION "public"."handle_push_subscription"("p_endpoint" "text", "p_subscription" "jsonb", "p_user_agent" "text", "p_is_admin" boolean, "p_pref_events" boolean, "p_pref_class" boolean, "p_pref_clubs" boolean, "p_pref_filter_tags" "text"[], "p_pref_filter_class_genres" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_title_change_tags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  old_tag TEXT;
  new_tag TEXT;
  rows_updated_content INT;
  rows_updated_desc INT;
BEGIN
  -- Logic: If title changed, update references
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    -- Generate tags using regex to match JS behavior (replace all whitespace sequences with single underscore)
    -- JS: title.replace(/\s+/g, '_')
    old_tag := '#' || regexp_replace(OLD.title, '\s+', '_', 'g');
    new_tag := '#' || regexp_replace(NEW.title, '\s+', '_', 'g');
    
    -- Update Content in history_nodes
    UPDATE history_nodes
    SET content = REPLACE(content, old_tag, new_tag)
    WHERE content LIKE '%' || old_tag || '%';
    GET DIAGNOSTICS rows_updated_content = ROW_COUNT;
    
    -- Update Description in history_nodes
    UPDATE history_nodes
    SET description = REPLACE(description, old_tag, new_tag)
    WHERE description LIKE '%' || old_tag || '%';
    GET DIAGNOSTICS rows_updated_desc = ROW_COUNT;
    
    -- Update Content in learning_resources
    UPDATE learning_resources
    SET content = REPLACE(content, old_tag, new_tag)
    WHERE content LIKE '%' || old_tag || '%';
    
    -- Update Description in learning_resources
    UPDATE learning_resources
    SET description = REPLACE(description, old_tag, new_tag)
    WHERE description LIKE '%' || old_tag || '%';
    
    -- Log for debugging
    RAISE LOG 'Auto-updated tags from % to % (history_nodes: content=%, desc=%)', 
              old_tag, new_tag, rows_updated_content, rows_updated_desc;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_title_change_tags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_withdrawal"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE board_users
    SET 
        nickname = '탈퇴한 사용자',
        real_name = NULL,
        phone_number = NULL,
        kakao_id = NULL,
        profile_image = NULL,
        gender = NULL,
        age_range = NULL,
        status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
    -- Cast p_user_id to text because board_users.user_id is likely TEXT
    WHERE user_id::text = p_user_id::text; 
END;
$$;


ALTER FUNCTION "public"."handle_user_withdrawal"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_item_views"("p_item_id" bigint, "p_item_type" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_fingerprint" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 6시간 이내에 동일 유저/핑거프린트의 조회 기록이 있는지 확인
  IF p_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM item_views
    WHERE item_id = p_item_id
      AND item_type = p_item_type
      AND user_id = p_user_id
      AND created_at > now() - interval '6 hours';
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM item_views
    WHERE item_id = p_item_id
      AND item_type = p_item_type
      AND fingerprint = p_fingerprint
      AND created_at > now() - interval '6 hours';
  END IF;

  -- 6시간 내 기록이 없으면 신규 조회로 인정
  IF v_count = 0 THEN
    -- 로그 삽입
    INSERT INTO item_views (item_id, item_type, user_id, fingerprint)
    VALUES (p_item_id, p_item_type, p_user_id, p_fingerprint);

    -- 해당 테이블의 views 카운터 증가
    CASE p_item_type
      WHEN 'board_post' THEN
        UPDATE board_posts 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'event' THEN
        UPDATE events 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'schedule' THEN
        UPDATE social_schedules 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      ELSE
        -- 지원하지 않는 타입은 로그만 남김
    END CASE;

    RETURN TRUE;
  END IF;

  -- 6시간 이내 재방문은 카운트하지 않음
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."increment_item_views"("p_item_id" bigint, "p_item_type" "text", "p_user_id" "uuid", "p_fingerprint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS '관리자 체크 (board_admins UUID 기반)';



CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin_user"() IS '관리자 체크 (board_admins UUID 기반)';



CREATE OR REPLACE FUNCTION "public"."notify_board_post_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only notify if important fields changed (not just views)
  IF (TG_OP = 'DELETE') OR 
     (TG_OP = 'INSERT') OR
     (TG_OP = 'UPDATE' AND (
       OLD.title IS DISTINCT FROM NEW.title OR
       OLD.content IS DISTINCT FROM NEW.content OR
       OLD.is_hidden IS DISTINCT FROM NEW.is_hidden OR
       OLD.is_notice IS DISTINCT FROM NEW.is_notice
     )) THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."notify_board_post_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nuke_policies"("tbl_name" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = tbl_name AND schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl_name);
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."nuke_policies"("tbl_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_site_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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

  -- 2. Performance Tracking (Last 12 Months)
  WITH individual_dates AS (
    -- Multi-day events (from event_dates jsonb array)
    SELECT 
      to_char(d::date, 'YYYY-MM') as month_key,
      (extract(dow FROM d::date)::int) as dow,
      category, group_id, genre, title, d::date as activity_date,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as reg_date,
      created_at,
      false as is_recurring
    FROM public.events, jsonb_array_elements_text(coalesce(event_dates, '[]'::jsonb)) d
    WHERE category NOT IN ('notice', 'notice_popup', 'board') AND day_of_week IS NULL
    -- REMOVED DATE FILTER: AND d::date >= (v_kr_now::date - interval '1 year')
    UNION ALL
    -- Single-day events (from start_date or date)
    SELECT 
      to_char(coalesce(start_date::date, date::date), 'YYYY-MM') as month_key,
      (extract(dow FROM coalesce(start_date::date, date::date))::int) as dow,
      category, group_id, genre, title, coalesce(start_date::date, date::date) as activity_date,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as reg_date,
      created_at,
      false as is_recurring
    FROM public.events
    WHERE category NOT IN ('notice', 'notice_popup', 'board') AND day_of_week IS NULL
    AND (event_dates IS NULL OR jsonb_array_length(event_dates) = 0)
    AND (start_date IS NOT NULL OR date IS NOT NULL)
    -- REMOVED DATE FILTER: AND coalesce(start_date::date, date::date) >= (v_kr_now::date - interval '1 year')
    -- REMOVED RECURRING EVENTS UNION
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
     AND created_at >= (v_kr_now - interval '1 year')
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
        'genre', coalesce(genre, ''), 'date', coalesce(to_char(activity_date, 'YYYY-MM-DD'), '정기 일정'), 'createdAt', reg_date
      ) ORDER BY coalesce(activity_date, '2000-01-01'::date) DESC) as items_list
    FROM (
      SELECT *, (is_recurring OR coalesce(activity_date, created_at::date) >= (v_kr_now::date - interval '1 month')) as is_monthly FROM individual_dates
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
$$;


ALTER FUNCTION "public"."refresh_site_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_site_stats_index"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."refresh_site_stats_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_board_user"("p_user_id" "text", "p_nickname" "text", "p_real_name" "text", "p_phone" "text", "p_gender" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO board_users (user_id, nickname, real_name, phone, gender)
  VALUES (p_user_id, p_nickname, p_real_name, p_phone, p_gender)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."register_board_user"("p_user_id" "text", "p_nickname" "text", "p_real_name" "text", "p_phone" "text", "p_gender" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_board_user"("p_user_id" character varying, "p_nickname" character varying, "p_real_name" character varying, "p_phone" character varying, "p_gender" character varying) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSON;
BEGIN
  -- 이미 등록된 사용자인지 확인
  IF EXISTS (SELECT 1 FROM board_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION '이미 가입된 사용자입니다.';
  END IF;

  -- 회원 등록
  INSERT INTO board_users (user_id, nickname, real_name, phone, gender)
  VALUES (p_user_id, p_nickname, p_real_name, p_phone, p_gender)
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'nickname', nickname,
    'real_name', real_name,
    'phone', phone,
    'gender', gender,
    'created_at', created_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."register_board_user"("p_user_id" character varying, "p_nickname" character varying, "p_real_name" character varying, "p_phone" character varying, "p_gender" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_admin"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can remove admins';
  END IF;
  
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself as admin';
  END IF;
  
  DELETE FROM board_admins WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."remove_admin"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_admin"("p_user_id" "uuid") IS '관리자 제거 (관리자만 가능, 자기 자신 제거 불가)';



CREATE OR REPLACE FUNCTION "public"."suppress_views_realtime"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 조회수만 변경되었는지 체크 (로직은 있지만)
  -- 중요: 항상 NEW를 반환하여 업데이트 허용
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."suppress_views_realtime"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suppress_views_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- views만 변경된 경우 Realtime 알림 차단
  IF (OLD.title = NEW.title AND 
      OLD.content = NEW.content AND 
      OLD.is_hidden = NEW.is_hidden AND
      OLD.is_notice = NEW.is_notice AND
      OLD.views <> NEW.views) THEN
    -- views만 변경된 경우, Realtime에 알리지 않음
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."suppress_views_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_anonymous_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE public.board_anonymous_posts 
    SET comment_count = (SELECT count(*) FROM public.board_anonymous_comments WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
    WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_anonymous_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_anonymous_post_dislikes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    d_count integer;
BEGIN
    SELECT count(*) INTO d_count FROM public.board_anonymous_dislikes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id);
    
    UPDATE public.board_anonymous_posts 
    SET 
        dislikes = d_count,
        is_hidden = (CASE WHEN d_count >= 2 THEN true ELSE is_hidden END)
    WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_anonymous_post_dislikes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_anonymous_post_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE public.board_anonymous_posts 
    SET likes = (SELECT count(*) FROM public.board_anonymous_likes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
    WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_anonymous_post_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_comment_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_table_name text;
    v_target_table text;
    v_comment_id_text text;
    v_likes integer;
    v_dislikes integer;
BEGIN
    v_table_name := TG_TABLE_NAME;
    v_comment_id_text := COALESCE(NEW.comment_id, OLD.comment_id)::text;

    IF v_table_name LIKE 'board_anonymous%' THEN
        v_target_table := 'board_anonymous_comments';
        -- For anonymous comments (ID is bigint)
        SELECT count(*) INTO v_likes FROM public.board_anonymous_comment_likes WHERE comment_id = v_comment_id_text::bigint;
        SELECT count(*) INTO v_dislikes FROM public.board_anonymous_comment_dislikes WHERE comment_id = v_comment_id_text::bigint;
        
        UPDATE public.board_anonymous_comments 
        SET likes = v_likes, dislikes = v_dislikes 
        WHERE id = v_comment_id_text::bigint;
    ELSE
        v_target_table := 'board_comments';
        -- For standard comments (ID is uuid)
        SELECT count(*) INTO v_likes FROM public.board_comment_likes WHERE comment_id = v_comment_id_text::uuid;
        SELECT count(*) INTO v_dislikes FROM public.board_comment_dislikes WHERE comment_id = v_comment_id_text::uuid;

        UPDATE public.board_comments 
        SET likes = v_likes, dislikes = v_dislikes 
        WHERE id = v_comment_id_text::uuid;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_comment_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_post_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE public.board_posts 
    SET likes = (SELECT count(*) FROM public.board_post_likes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
    WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_post_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_fingerprint" "text", "p_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
    v_table text;
    v_opposite_table text;
    v_exists boolean;
    v_result jsonb;
BEGIN
    IF p_type = 'like' THEN
        v_table := 'board_anonymous_likes';
        v_opposite_table := 'board_anonymous_dislikes';
    ELSIF p_type = 'dislike' THEN
        v_table := 'board_anonymous_dislikes';
        v_opposite_table := 'board_anonymous_likes';
    ELSE
        RAISE EXCEPTION 'Invalid interaction type. Use ''like'' or ''dislike''.';
    END IF;

    -- Check if current interaction exists
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE post_id = $1 AND fingerprint = $2)', v_table)
    INTO v_exists
    USING p_post_id, p_fingerprint;

    IF v_exists THEN
        -- Toggle OFF: Remove current
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND fingerprint = $2', v_table)
        USING p_post_id, p_fingerprint;
        v_result := jsonb_build_object('status', 'removed', 'type', p_type);
    ELSE
        -- Toggle ON: Insert current and remove opposite
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND fingerprint = $2', v_opposite_table)
        USING p_post_id, p_fingerprint;
        
        EXECUTE format('INSERT INTO public.%I (post_id, fingerprint) VALUES ($1, $2)', v_table)
        USING p_post_id, p_fingerprint;
        v_result := jsonb_build_object('status', 'added', 'type', p_type);
    END IF;

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$_$;


ALTER FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_fingerprint" "text", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_user_id" "uuid", "p_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
    v_table text;
    v_opposite_table text;
    v_exists boolean;
    v_result jsonb;
BEGIN
    IF p_type = 'like' THEN
        v_table := 'board_anonymous_likes';
        v_opposite_table := 'board_anonymous_dislikes';
    ELSIF p_type = 'dislike' THEN
        v_table := 'board_anonymous_dislikes';
        v_opposite_table := 'board_anonymous_likes';
    ELSE
        RAISE EXCEPTION 'Invalid interaction type. Use ''like'' or ''dislike''.';
    END IF;

    -- Check if current interaction exists
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE post_id = $1 AND user_id = $2)', v_table)
    INTO v_exists
    USING p_post_id, p_user_id;

    IF v_exists THEN
        -- Toggle OFF: Remove current
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND user_id = $2', v_table)
        USING p_post_id, p_user_id;
        v_result := jsonb_build_object('status', 'removed', 'type', p_type);
    ELSE
        -- Toggle ON: Insert current and remove opposite
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND user_id = $2', v_opposite_table)
        USING p_post_id, p_user_id;
        
        EXECUTE format('INSERT INTO public.%I (post_id, user_id) VALUES ($1, $2)', v_table)
        USING p_post_id, p_user_id;
        v_result := jsonb_build_object('status', 'added', 'type', p_type);
    END IF;

    RETURN v_result;
END;
$_$;


ALTER FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_user_id" "uuid", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_comment_interaction"("p_comment_id" "text", "p_type" "text", "p_is_anonymous" boolean, "p_fingerprint" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
    v_user_id uuid;
    v_likes_table text;
    v_dislikes_table text;
    v_current_table text;
    v_opposite_table text;
    v_exists boolean;
    v_comment_id_uuid uuid;
    v_comment_id_bigint bigint;
BEGIN
    v_user_id := auth.uid();
    
    -- Both anonymous and standard now require authentication
    IF v_user_id IS NULL THEN 
        RAISE EXCEPTION 'Authentication required for comment interactions'; 
    END IF;
    
    IF p_is_anonymous THEN
        v_likes_table := 'board_anonymous_comment_likes';
        v_dislikes_table := 'board_anonymous_comment_dislikes';
        v_comment_id_bigint := p_comment_id::bigint;
    ELSE
        v_likes_table := 'board_comment_likes';
        v_dislikes_table := 'board_comment_dislikes';
        v_comment_id_uuid := p_comment_id::uuid;
    END IF;

    IF p_type = 'like' THEN
        v_current_table := v_likes_table;
        v_opposite_table := v_dislikes_table;
    ELSE
        v_current_table := v_dislikes_table;
        v_opposite_table := v_likes_table;
    END IF;

    -- Check existence using user_id for both anonymous and standard
    IF p_is_anonymous THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE comment_id = $1 AND user_id = $2)', v_current_table)
        INTO v_exists USING v_comment_id_bigint, v_user_id;
    ELSE
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE comment_id = $1 AND user_id = $2)', v_current_table)
        INTO v_exists USING v_comment_id_uuid, v_user_id;
    END IF;

    IF v_exists THEN
        -- Toggle OFF
        IF p_is_anonymous THEN
            EXECUTE format('DELETE FROM public.%I WHERE comment_id = $1 AND user_id = $2', v_current_table)
            USING v_comment_id_bigint, v_user_id;
        ELSE
            EXECUTE format('DELETE FROM public.%I WHERE comment_id = $1 AND user_id = $2', v_current_table)
            USING v_comment_id_uuid, v_user_id;
        END IF;
        RETURN jsonb_build_object('status', 'removed', 'type', p_type);
    ELSE
        -- Toggle ON: Remove opposite and add current
        IF p_is_anonymous THEN
            EXECUTE format('DELETE FROM public.%I WHERE comment_id = $1 AND user_id = $2', v_opposite_table)
            USING v_comment_id_bigint, v_user_id;
            EXECUTE format('INSERT INTO public.%I (comment_id, user_id) VALUES ($1, $2)', v_current_table)
            USING v_comment_id_bigint, v_user_id;
        ELSE
            EXECUTE format('DELETE FROM public.%I WHERE comment_id = $1 AND user_id = $2', v_opposite_table)
            USING v_comment_id_uuid, v_user_id;
            EXECUTE format('INSERT INTO public.%I (comment_id, user_id) VALUES ($1, $2)', v_current_table)
            USING v_comment_id_uuid, v_user_id;
        END IF;
        RETURN jsonb_build_object('status', 'added', 'type', p_type);
    END IF;
END;
$_$;


ALTER FUNCTION "public"."toggle_comment_interaction"("p_comment_id" "text", "p_type" "text", "p_is_anonymous" boolean, "p_fingerprint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text", "p_content" "text", "p_author_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE board_anonymous_comments
  SET content = p_content,
      author_name = p_author_name
  WHERE id = p_comment_id AND password = p_password;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text", "p_content" "text", "p_author_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_nickname" "text", "p_image" "text" DEFAULT NULL::"text", "p_image_thumbnail" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE board_anonymous_posts
SET title = p_title,
      content = p_content,
      author_name = p_nickname,
      author_nickname = p_nickname,
      image = COALESCE(p_image, image),
      image_thumbnail = COALESCE(p_image_thumbnail, image_thumbnail),
      updated_at = NOW()
  WHERE id = p_post_id AND password = p_password;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_nickname" "text", "p_image" "text", "p_image_thumbnail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_billboard_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_billboard_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_board_post"("p_post_id" integer, "p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_is_notice" boolean DEFAULT false, "p_prefix_id" integer DEFAULT NULL::integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
  v_is_admin BOOLEAN;
  v_prefix_admin_only BOOLEAN;
BEGIN
  -- 작성자 본인인지 확인
  IF NOT EXISTS (SELECT 1 FROM board_posts WHERE id = p_post_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  -- 관리자 여부 확인
  v_is_admin := COALESCE((auth.jwt()->>'app_metadata')::jsonb->>'is_admin' = 'true', FALSE);

  -- prefix_id가 있으면 admin_only 여부 확인
  IF p_prefix_id IS NOT NULL THEN
    SELECT COALESCE(admin_only, FALSE) INTO v_prefix_admin_only
    FROM board_prefixes
    WHERE id = p_prefix_id;

    -- 관리자 전용 머릿말을 일반 사용자가 선택하려고 하면 에러
    IF COALESCE(v_prefix_admin_only, FALSE) = TRUE AND COALESCE(v_is_admin, FALSE) = FALSE THEN
      RAISE EXCEPTION '관리자 전용 머릿말입니다.';
    END IF;
  END IF;

  UPDATE board_posts
  SET 
    title = p_title,
    content = p_content,
    is_notice = p_is_notice,
    prefix_id = p_prefix_id,
    updated_at = NOW()
  WHERE id = p_post_id
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'is_notice', is_notice,
    'prefix_id', prefix_id,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result::JSON;
END;
$$;


ALTER FUNCTION "public"."update_board_post"("p_post_id" integer, "p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_is_notice" boolean, "p_prefix_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_history_nodes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_history_nodes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_learning_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_learning_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_metronome_presets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_metronome_presets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Use COALESCE to handle NULLs (NULL + 1 = NULL, which is bad)
        UPDATE board_posts
        SET comment_count = COALESCE(comment_count, 0) + 1
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Prevent negative counts with GREATEST
        UPDATE board_posts
        SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_post_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_favorites_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.board_posts
        SET favorites = favorites + 1
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.board_posts
        SET favorites = favorites - 1
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_post_favorites_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_author_name" "text", "p_image" "text", "p_image_thumbnail" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.board_posts WHERE id = p_post_id AND password = p_password) THEN
        UPDATE public.board_posts 
        SET 
            title = p_title,
            content = p_content,
            author_name = p_author_name,
            author_nickname = p_author_name,
            image = COALESCE(p_image, image),
            image_thumbnail = COALESCE(p_image_thumbnail, image_thumbnail),
            updated_at = now()
        WHERE id = p_post_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;


ALTER FUNCTION "public"."update_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_author_name" "text", "p_image" "text", "p_image_thumbnail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_social_event_with_password"("p_event_id" integer, "p_password" "text", "p_title" "text", "p_event_date" "date", "p_place_id" integer, "p_description" "text", "p_image_url" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_real_password TEXT;
  v_updated_event JSON;
BEGIN
  -- 이벤트의 실제 비밀번호를 가져옵니다.
  SELECT password INTO v_real_password FROM public.social_events WHERE id = p_event_id;

  -- 이벤트가 없거나 비밀번호가 일치하지 않으면 에러를 발생시킵니다.
  IF NOT FOUND OR v_real_password IS NULL OR v_real_password != p_password THEN
    RAISE EXCEPTION '비밀번호가 올바르지 않거나, 존재하지 않는 일정입니다.';
  END IF;

  -- 비밀번호가 일치하면 데이터를 업데이트합니다.
  UPDATE public.social_events
  SET
    title = p_title,
    event_date = p_event_date,
    place_id = p_place_id,
    description = p_description,
    image_url = p_image_url
  WHERE id = p_event_id
  RETURNING to_json(social_events.*) INTO v_updated_event;

  RETURN v_updated_event;
END;
$$;


ALTER FUNCTION "public"."update_social_event_with_password"("p_event_id" integer, "p_password" "text", "p_title" "text", "p_event_date" "date", "p_place_id" integer, "p_description" "text", "p_image_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" integer, "p_password" "text", "p_title" "text", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_description" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_real_password TEXT;
    v_updated_schedule JSON;
BEGIN
    -- 스케줄의 실제 비밀번호를 가져옵니다.
    SELECT password INTO v_real_password FROM public.social_schedules WHERE id = p_schedule_id;

    -- 스케줄이 없거나 비밀번호가 일치하지 않으면 에러를 발생시킵니다.
    IF NOT FOUND OR v_real_password IS NULL OR v_real_password != p_password THEN
        RAISE EXCEPTION '비밀번호가 올바르지 않거나, 존재하지 않는 스케줄입니다.';
    END IF;

    -- 비밀번호가 일치하면 데이터를 업데이트합니다.
    UPDATE public.social_schedules
    SET
        title = p_title,
        date = p_date,
        start_time = p_start_time,
        end_time = p_end_time,
        description = p_description
    WHERE id = p_schedule_id
    RETURNING to_json(social_schedules.*) INTO v_updated_schedule;

    RETURN v_updated_schedule;
END;
$$;


ALTER FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" integer, "p_password" "text", "p_title" "text", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" bigint, "p_password" "text", "p_title" "text", "p_date" "text", "p_start_time" "text", "p_end_time" "text", "p_description" "text", "p_day_of_week" integer DEFAULT NULL::integer, "p_inquiry_contact" "text" DEFAULT NULL::"text", "p_link_name" "text" DEFAULT NULL::"text", "p_link_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_password text;
BEGIN
  -- Check password
  SELECT password INTO v_password
  FROM social_schedules
  WHERE id = p_schedule_id;

  IF v_password != p_password THEN
    RAISE EXCEPTION 'Password does not match';
  END IF;

  -- Update record
  UPDATE social_schedules
  SET
    title = p_title,
    date = p_date,
    start_time = p_start_time,
    end_time = p_end_time,
    description = p_description,
    day_of_week = p_day_of_week,
    inquiry_contact = p_inquiry_contact,
    link_name = p_link_name,
    link_url = p_link_url
  WHERE id = p_schedule_id;
END;
$$;


ALTER FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" bigint, "p_password" "text", "p_title" "text", "p_date" "text", "p_start_time" "text", "p_end_time" "text", "p_description" "text", "p_day_of_week" integer, "p_inquiry_contact" "text", "p_link_name" "text", "p_link_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."update_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_anonymous_post_password"("p_post_id" bigint, "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.board_anonymous_posts 
        WHERE id = p_post_id AND password = p_password
    );
END;
$$;


ALTER FUNCTION "public"."verify_anonymous_post_password"("p_post_id" bigint, "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_post_password"("p_post_id" bigint, "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.board_posts 
        WHERE id = p_post_id AND password = p_password
    );
END;
$$;


ALTER FUNCTION "public"."verify_post_password"("p_post_id" bigint, "p_password" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."site_analytics_logs" (
    "id" bigint NOT NULL,
    "target_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_title" "text",
    "section" "text" NOT NULL,
    "category" "text",
    "route" "text",
    "user_id" "uuid",
    "fingerprint" "text",
    "is_admin" boolean DEFAULT false,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "session_id" "text",
    "sequence_number" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "landing_page" "text",
    "page_url" "text"
);


ALTER TABLE "public"."site_analytics_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."analytics_daily_summary" WITH ("security_invoker"='true') AS
 SELECT "date"(("created_at" AT TIME ZONE 'Asia/Seoul'::"text")) AS "date",
    "target_type",
    "count"(DISTINCT "concat"(COALESCE(("user_id")::"text", ''::"text"), COALESCE("fingerprint", ''::"text"), "target_id")) AS "unique_clicks",
    "count"(DISTINCT "user_id") FILTER (WHERE (("user_id" IS NOT NULL) AND (("is_admin" IS NULL) OR ("is_admin" = false)))) AS "unique_users",
    "count"(DISTINCT "fingerprint") FILTER (WHERE (("user_id" IS NULL) AND (("is_admin" IS NULL) OR ("is_admin" = false)))) AS "unique_guests"
   FROM "public"."site_analytics_logs"
  WHERE (("is_admin" IS NULL) OR ("is_admin" = false))
  GROUP BY ("date"(("created_at" AT TIME ZONE 'Asia/Seoul'::"text"))), "target_type";


ALTER VIEW "public"."analytics_daily_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_daily_summary" IS '날짜별/타입별 집계 데이터 (성능 최적화용)';



CREATE OR REPLACE VIEW "public"."analytics_export_view" WITH ("security_invoker"='true') AS
 SELECT "date"(("created_at" AT TIME ZONE 'Asia/Seoul'::"text")) AS "date",
    "target_type",
    "target_title",
    "section",
    "count"(*) AS "total_clicks",
    "count"(DISTINCT "user_id") FILTER (WHERE ("user_id" IS NOT NULL)) AS "unique_users",
    "count"(DISTINCT "fingerprint") FILTER (WHERE ("user_id" IS NULL)) AS "unique_guests"
   FROM "public"."site_analytics_logs"
  WHERE (("is_admin" IS NULL) OR ("is_admin" = false))
  GROUP BY ("date"(("created_at" AT TIME ZONE 'Asia/Seoul'::"text"))), "target_type", "target_title", "section"
  ORDER BY ("date"(("created_at" AT TIME ZONE 'Asia/Seoul'::"text"))) DESC, ("count"(*)) DESC;


ALTER VIEW "public"."analytics_export_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."analytics_export_view" IS 'CSV Export용 상세 데이터';



CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


ALTER TABLE "public"."app_settings" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_settings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."billboard_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "enabled" boolean DEFAULT true,
    "auto_slide_interval" integer DEFAULT 5000,
    "inactivity_timeout" integer DEFAULT 30000,
    "auto_open_on_load" boolean DEFAULT false,
    "transition_duration" integer DEFAULT 500,
    "date_range_start" "date",
    "date_range_end" "date",
    "show_date_range" boolean DEFAULT false,
    "play_order" character varying(20) DEFAULT 'sequential'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "excluded_weekdays" integer[] DEFAULT '{}'::integer[],
    "excluded_event_ids" integer[] DEFAULT '{}'::integer[],
    "default_thumbnail_url" "text",
    "default_thumbnail_class" "text",
    "default_thumbnail_event" "text",
    "effect_type" character varying DEFAULT 'fade'::character varying,
    "effect_speed" integer DEFAULT 300,
    CONSTRAINT "billboard_settings_play_order_check" CHECK ((("play_order")::"text" = ANY ((ARRAY['sequential'::character varying, 'random'::character varying])::"text"[]))),
    CONSTRAINT "single_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."billboard_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billboard_user_settings" (
    "id" integer NOT NULL,
    "billboard_user_id" "uuid" NOT NULL,
    "excluded_weekdays" integer[] DEFAULT ARRAY[]::integer[],
    "excluded_event_ids" integer[] DEFAULT ARRAY[]::integer[],
    "auto_slide_interval" integer DEFAULT 5000,
    "transition_duration" integer DEFAULT 500,
    "play_order" character varying(20) DEFAULT 'sequential'::character varying,
    "date_filter_start" "date",
    "date_filter_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "effect_type" character varying DEFAULT 'fade'::character varying,
    "effect_speed" integer DEFAULT 300,
    "video_play_duration" integer DEFAULT 10000,
    "auto_slide_interval_video" integer DEFAULT 5000,
    CONSTRAINT "billboard_user_settings_play_order_check" CHECK ((("play_order")::"text" = ANY ((ARRAY['sequential'::character varying, 'random'::character varying])::"text"[])))
);


ALTER TABLE "public"."billboard_user_settings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."billboard_user_settings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."billboard_user_settings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."billboard_user_settings_id_seq" OWNED BY "public"."billboard_user_settings"."id";



CREATE TABLE IF NOT EXISTS "public"."billboard_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "password_hash" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "email" character varying
);


ALTER TABLE "public"."billboard_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."board_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."board_admins" IS '관리자 목록 (Single Source of Truth)';



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_comment_dislikes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_anonymous_comment_dislikes" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_comment_dislikes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_comment_dislikes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_comment_likes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_anonymous_comment_likes" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_comment_likes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_comment_likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_comments" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "content" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "password" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "likes" integer DEFAULT 0,
    "dislikes" integer DEFAULT 0
);


ALTER TABLE "public"."board_anonymous_comments" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_comments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_dislikes" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "fingerprint" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."board_anonymous_dislikes" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_dislikes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_dislikes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_likes" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "fingerprint" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."board_anonymous_likes" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_likes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_anonymous_posts" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "author_nickname" "text",
    "image" "text",
    "image_thumbnail" "text",
    "password" "text" NOT NULL,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "dislikes" integer DEFAULT 0,
    "is_notice" boolean DEFAULT false,
    "is_hidden" boolean DEFAULT false,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "comment_count" integer DEFAULT 0
);


ALTER TABLE "public"."board_anonymous_posts" OWNER TO "postgres";


ALTER TABLE "public"."board_anonymous_posts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_anonymous_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_banned_words" (
    "id" bigint NOT NULL,
    "word" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_banned_words" OWNER TO "postgres";


ALTER TABLE "public"."board_banned_words" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_banned_words_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_categories" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0
);


ALTER TABLE "public"."board_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_comment_dislikes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_comment_dislikes" OWNER TO "postgres";


ALTER TABLE "public"."board_comment_dislikes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_comment_dislikes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_comment_likes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_comment_likes" OWNER TO "postgres";


ALTER TABLE "public"."board_comment_likes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_comment_likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" bigint NOT NULL,
    "user_id" "uuid",
    "author_name" "text" NOT NULL,
    "author_nickname" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "password" "text",
    "likes" integer DEFAULT 0,
    "dislikes" integer DEFAULT 0
);


ALTER TABLE "public"."board_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_post_dislikes" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "post_id" bigint NOT NULL,
    "fingerprint" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_post_dislikes" OWNER TO "postgres";


ALTER TABLE "public"."board_post_dislikes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_post_dislikes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_post_favorites" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_post_favorites" OWNER TO "postgres";


ALTER TABLE "public"."board_post_favorites" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_post_favorites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_post_likes" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."board_post_likes" OWNER TO "postgres";


ALTER TABLE "public"."board_post_likes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_post_likes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_post_views" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "fingerprint" "text",
    "post_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "check_user_or_fingerprint" CHECK (((("user_id" IS NOT NULL) AND ("fingerprint" IS NULL)) OR (("user_id" IS NULL) AND ("fingerprint" IS NOT NULL))))
);


ALTER TABLE "public"."board_post_views" OWNER TO "postgres";


ALTER TABLE "public"."board_post_views" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_post_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_posts" (
    "id" integer NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "user_id" "text",
    "author_nickname" "text",
    "views" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "prefix_id" integer,
    "is_notice" boolean DEFAULT false NOT NULL,
    "category" "text" DEFAULT 'free'::"text",
    "image_thumbnail" "text",
    "image" "text",
    "is_hidden" boolean DEFAULT false,
    "comment_count" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "dislikes" integer DEFAULT 0,
    "display_order" integer DEFAULT 0,
    "favorites" integer DEFAULT 0,
    CONSTRAINT "check_category" CHECK (("category" = ANY (ARRAY['free'::"text", 'trade'::"text", 'notice'::"text", 'market'::"text", 'anonymous'::"text", 'dev-log'::"text"])))
);


ALTER TABLE "public"."board_posts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."board_posts"."category" IS 'Post category: free, trade, notice, market';



CREATE SEQUENCE IF NOT EXISTS "public"."board_posts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."board_posts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."board_posts_id_seq" OWNED BY "public"."board_posts"."id";



CREATE TABLE IF NOT EXISTS "public"."board_prefixes" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "admin_only" boolean DEFAULT false,
    "display_order" integer DEFAULT 0,
    "board_category_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."board_prefixes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_prefixes_backup" (
    "id" integer NOT NULL,
    "name" character varying(50) NOT NULL,
    "color" character varying(20) DEFAULT '#3B82F6'::character varying NOT NULL,
    "admin_only" boolean DEFAULT false,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "board_category_code" "text"
);


ALTER TABLE "public"."board_prefixes_backup" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."board_prefixes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."board_prefixes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."board_prefixes_id_seq" OWNED BY "public"."board_prefixes_backup"."id";



ALTER TABLE "public"."board_prefixes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."board_prefixes_id_seq1"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."board_users" (
    "id" integer NOT NULL,
    "user_id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "gender" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "kakao_id" "text",
    "profile_image" "text",
    "phone_number" "text",
    "age_range" "text",
    "status" "text" DEFAULT 'active'::"text",
    "deleted_at" timestamp with time zone,
    "email" "text",
    "provider" "text"
);


ALTER TABLE "public"."board_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."board_users"."phone_number" IS '전화번호 (선택, 형식: +82-10-1234-5678)';



COMMENT ON COLUMN "public"."board_users"."age_range" IS '연령대 (선택, 예: 10대, 20대, 30대, 40대, 50대, 60대 이상)';



COMMENT ON COLUMN "public"."board_users"."email" IS '사용자 계정 이메일 (동기화용)';



COMMENT ON COLUMN "public"."board_users"."provider" IS '가입 경로 (kakao, google 등)';



CREATE SEQUENCE IF NOT EXISTS "public"."board_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."board_users_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."board_users_id_seq" OWNED BY "public"."board_users"."id";



CREATE TABLE IF NOT EXISTS "public"."crawl_history" (
    "id" bigint NOT NULL,
    "url" "text" NOT NULL,
    "last_crawled_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "items_found" integer DEFAULT 0
);


ALTER TABLE "public"."crawl_history" OWNER TO "postgres";


ALTER TABLE "public"."crawl_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."crawl_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."crawling_events" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "title" "text" NOT NULL,
    "date" "text",
    "content" "text",
    "author" "text",
    "sourceUrl" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."crawling_events" OWNER TO "postgres";


ALTER TABLE "public"."crawling_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."crawling_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deployments" (
    "id" integer NOT NULL,
    "deployed_at" timestamp with time zone DEFAULT "now"(),
    "build_id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"()
);

ALTER TABLE ONLY "public"."deployments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."deployments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."deployments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."deployments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deployments_id_seq" OWNED BY "public"."deployments"."id";



CREATE TABLE IF NOT EXISTS "public"."event_favorites" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."event_favorites" OWNER TO "postgres";


ALTER TABLE "public"."event_favorites" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."event_favorites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" integer NOT NULL,
    "title" character varying(255) NOT NULL,
    "date" "date",
    "time" character varying(50),
    "location" character varying(255),
    "category" character varying(50) NOT NULL,
    "price" character varying(50),
    "image" "text",
    "description" "text",
    "organizer" character varying(255),
    "capacity" integer,
    "registered" integer DEFAULT 0,
    "link1" "text",
    "link2" "text",
    "link3" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_file" "text",
    "password" "text",
    "link_name1" "text",
    "link_name2" "text",
    "link_name3" "text",
    "start_date" "text",
    "end_date" "text",
    "image_thumbnail" "text",
    "image_medium" "text",
    "image_full" "text",
    "organizer_name" "text",
    "organizer_phone" "text",
    "video_url" "text",
    "event_dates" "jsonb",
    "location_link" "text",
    "contact" "text",
    "show_title_on_billboard" boolean DEFAULT true,
    "storage_path" "text",
    "genre" "text",
    "image_position_x" double precision DEFAULT 0,
    "image_position_y" double precision DEFAULT 0,
    "image_micro" "text",
    "user_id" "text",
    "venue_id" "uuid",
    "venue_name" character varying(200),
    "venue_custom_link" "text",
    "scope" "text" DEFAULT 'domestic'::"text",
    "views" integer DEFAULT 0,
    "address" "text",
    "group_id" bigint,
    "day_of_week" smallint,
    CONSTRAINT "events_category_check" CHECK ((("category")::"text" = ANY ((ARRAY['class'::character varying, 'event'::character varying, 'regular'::character varying, 'club'::character varying, 'social'::character varying, 'swing-bar'::character varying, 'swing-club'::character varying, 'other'::character varying])::"text"[])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."video_url" IS '영상 URL (YouTube, Instagram, Facebook 등)';



COMMENT ON COLUMN "public"."events"."storage_path" IS 'Supabase Storage에 저장된 이벤트 이미지 폴더 경로 (폴더 방식 삭제 지원용)';



COMMENT ON COLUMN "public"."events"."venue_id" IS 'Reference to registered venue (if selected from venue list)';



COMMENT ON COLUMN "public"."events"."venue_name" IS 'Custom venue name (if entered manually)';



COMMENT ON COLUMN "public"."events"."venue_custom_link" IS 'Custom link for manually entered venues';



COMMENT ON COLUMN "public"."events"."scope" IS '행사 지역 범위 (domestic: 국내, overseas: 국외)';



CREATE SEQUENCE IF NOT EXISTS "public"."events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."events_id_seq" OWNED BY "public"."events"."id";



CREATE TABLE IF NOT EXISTS "public"."featured_items" (
    "id" bigint NOT NULL,
    "shop_id" bigint NOT NULL,
    "item_name" "text" NOT NULL,
    "item_price" numeric,
    "item_image_url" "text" NOT NULL,
    "item_link" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."featured_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."featured_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."featured_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."featured_items_id_seq" OWNED BY "public"."featured_items"."id";



CREATE TABLE IF NOT EXISTS "public"."global_notices" (
    "id" integer NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "image_url" "text",
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."global_notices" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."global_notices_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."global_notices_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."global_notices_id_seq" OWNED BY "public"."global_notices"."id";



CREATE TABLE IF NOT EXISTS "public"."history_edges" (
    "id" bigint NOT NULL,
    "source_id" bigint NOT NULL,
    "target_id" bigint NOT NULL,
    "relation_type" "text" DEFAULT 'related'::"text",
    "label" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source_handle" "text",
    "target_handle" "text"
);


ALTER TABLE "public"."history_edges" OWNER TO "postgres";


COMMENT ON TABLE "public"."history_edges" IS 'Stores relationships between history nodes';



COMMENT ON COLUMN "public"."history_edges"."relation_type" IS 'Type of relationship: influenced, evolved, contemporary, related';



COMMENT ON COLUMN "public"."history_edges"."label" IS 'Description text shown on the connection line';



COMMENT ON COLUMN "public"."history_edges"."source_handle" IS 'ID of the specific handle on the source node (e.g., left, right, top, bottom)';



COMMENT ON COLUMN "public"."history_edges"."target_handle" IS 'ID of the specific handle on the target node (e.g., left, right, top, bottom)';



CREATE SEQUENCE IF NOT EXISTS "public"."history_edges_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."history_edges_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."history_edges_id_seq" OWNED BY "public"."history_edges"."id";



CREATE TABLE IF NOT EXISTS "public"."history_nodes" (
    "id" bigint NOT NULL,
    "title" "text",
    "date" "date",
    "year" integer,
    "description" "text",
    "youtube_url" "text",
    "category" "text" DEFAULT 'general'::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "position_x" double precision DEFAULT 0,
    "position_y" double precision DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "linked_playlist_id" "uuid",
    "linked_document_id" "uuid",
    "linked_video_id" "uuid",
    "linked_category_id" "uuid",
    "attachment_url" "text",
    "parent_node_id" bigint,
    "width" double precision,
    "height" double precision,
    "content" "text",
    "z_index" integer DEFAULT 0,
    "node_behavior" "public"."node_behavior" DEFAULT 'LEAF'::"public"."node_behavior",
    "space_id" bigint,
    "content_data" "jsonb" DEFAULT '{}'::"jsonb",
    "grid_row" integer DEFAULT 0,
    "grid_column" integer DEFAULT 0,
    "order_index" integer DEFAULT 0,
    "arrow_rotation" integer DEFAULT 0,
    "arrow_length" integer DEFAULT 200,
    "arrow_text" "text"
);


ALTER TABLE "public"."history_nodes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."history_nodes"."arrow_rotation" IS 'Arrow rotation angle in degrees (0-360)';



COMMENT ON COLUMN "public"."history_nodes"."arrow_length" IS 'Arrow length in pixels (100-500)';



COMMENT ON COLUMN "public"."history_nodes"."arrow_text" IS 'Text to display on the arrow';



CREATE TABLE IF NOT EXISTS "public"."history_nodes_backup_v7" (
    "id" bigint,
    "title" "text",
    "date" "date",
    "year" integer,
    "description" "text",
    "youtube_url" "text",
    "category" "text",
    "tags" "text"[],
    "position_x" double precision,
    "position_y" double precision,
    "created_by" "uuid",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "linked_playlist_id" "uuid",
    "linked_document_id" "uuid",
    "linked_video_id" "uuid",
    "linked_category_id" "uuid",
    "mobile_x" double precision,
    "mobile_y" double precision,
    "attachment_url" "text",
    "parent_node_id" bigint,
    "width" double precision,
    "height" double precision,
    "content" "text",
    "z_index" integer
);


ALTER TABLE "public"."history_nodes_backup_v7" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."history_nodes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."history_nodes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."history_nodes_id_seq" OWNED BY "public"."history_nodes"."id";



CREATE TABLE IF NOT EXISTS "public"."history_spaces" (
    "id" bigint NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" DEFAULT '나의 타임라인'::"text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."history_spaces" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."history_spaces_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."history_spaces_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."history_spaces_id_seq" OWNED BY "public"."history_spaces"."id";



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "text" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_views" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "fingerprint" "text",
    "item_type" "text" NOT NULL,
    "item_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "check_user_or_fingerprint" CHECK (((("user_id" IS NOT NULL) AND ("fingerprint" IS NULL)) OR (("user_id" IS NULL) AND ("fingerprint" IS NOT NULL))))
);


ALTER TABLE "public"."item_views" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."item_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."item_views_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."item_views_id_seq" OWNED BY "public"."item_views"."id";



CREATE TABLE IF NOT EXISTS "public"."learning_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "order_index" integer DEFAULT 0,
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "content" "text",
    "image_url" "text",
    "year" integer,
    "grid_row" integer DEFAULT 0,
    "grid_column" integer DEFAULT 0,
    "is_unclassified" boolean DEFAULT false
);


ALTER TABLE "public"."learning_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "url" "text",
    "image_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_index" integer DEFAULT 0,
    "is_unclassified" boolean DEFAULT true NOT NULL,
    "grid_row" integer DEFAULT 0,
    "grid_column" integer DEFAULT 0,
    "year" integer,
    "attachment_url" "text",
    "content" "text",
    CONSTRAINT "learning_resources_type_check" CHECK (("type" = ANY (ARRAY['video'::"text", 'document'::"text", 'person'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."learning_resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."learning_resources" IS 'Unified: Verified migration from categories and playlists using real schema.';



CREATE TABLE IF NOT EXISTS "public"."learning_video_bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "timestamp" double precision NOT NULL,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_overlay" boolean DEFAULT false,
    "overlay_x" double precision DEFAULT 50,
    "overlay_y" double precision DEFAULT 90,
    "overlay_duration" integer DEFAULT 3,
    "overlay_scale" double precision DEFAULT 1.0
);


ALTER TABLE "public"."learning_video_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metrics_cache" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."metrics_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metronome_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "bpm" integer DEFAULT 120,
    "beats" integer DEFAULT 4,
    "subdivision" integer DEFAULT 1,
    "swing_factor" integer DEFAULT 0,
    "offbeat_13_accent" integer DEFAULT 50,
    "offbeat_24_accent" integer DEFAULT 50,
    "downbeat_13_accent" integer DEFAULT 100,
    "backbeat_accent" integer DEFAULT 50,
    "triplet_2nd_accent" integer DEFAULT 50,
    "triplet_3rd_swing" integer DEFAULT 0,
    "sound_id" "text" DEFAULT 'brush'::"text",
    "beat_volumes" "jsonb" DEFAULT '[3, 3, 3, 3]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."metronome_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_queue" (
    "id" bigint NOT NULL,
    "event_id" bigint,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" NOT NULL,
    "payload" "jsonb",
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_queue" OWNER TO "postgres";


ALTER TABLE "public"."notification_queue" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."notification_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."practice_room_favorites" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "practice_room_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."practice_room_favorites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."practice_room_favorites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."practice_room_favorites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."practice_room_favorites_id_seq" OWNED BY "public"."practice_room_favorites"."id";



CREATE TABLE IF NOT EXISTS "public"."practice_rooms" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "image" "text" NOT NULL,
    "price_per_hour" character varying(100) NOT NULL,
    "capacity" integer NOT NULL,
    "equipment" "text" NOT NULL,
    "available_hours" character varying(100) NOT NULL,
    "contact" character varying(100) NOT NULL,
    "location" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "attachment_link" "text",
    "image_url" "text",
    "naver_map_link" "text",
    "images" "text",
    "additional_link" "text",
    "address" "text",
    "address_link" "text",
    "additional_link_title" "text",
    "password" "text"
);


ALTER TABLE "public"."practice_rooms" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."practice_rooms_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."practice_rooms_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."practice_rooms_id_seq" OWNED BY "public"."practice_rooms"."id";



CREATE TABLE IF NOT EXISTS "public"."pwa_installs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "fingerprint" "text",
    "installed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "install_page" "text",
    "display_mode" "text",
    "user_agent" "text",
    "platform" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "referrer" "text",
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pwa_installs" OWNER TO "postgres";


COMMENT ON TABLE "public"."pwa_installs" IS 'Tracks PWA installation events for analytics';



CREATE SEQUENCE IF NOT EXISTS "public"."pwa_installs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pwa_installs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pwa_installs_id_seq" OWNED BY "public"."pwa_installs"."id";



CREATE TABLE IF NOT EXISTS "public"."session_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "user_id" "text",
    "fingerprint" "text",
    "is_admin" boolean DEFAULT false,
    "session_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_end" timestamp with time zone,
    "page_views" integer DEFAULT 0,
    "total_clicks" integer DEFAULT 0,
    "entry_page" "text",
    "exit_page" "text",
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_pwa" boolean DEFAULT false,
    "pwa_display_mode" "text"
);


ALTER TABLE "public"."session_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_logs" IS '사용자 세션 로그 (익명 포함 모든 사용자 쓰기 가능, 관리자만 조회)';



COMMENT ON COLUMN "public"."session_logs"."session_id" IS '클라이언트 생성 세션 UUID';



COMMENT ON COLUMN "public"."session_logs"."entry_page" IS '첫 방문 페이지';



COMMENT ON COLUMN "public"."session_logs"."exit_page" IS '마지막 방문 페이지';



COMMENT ON COLUMN "public"."session_logs"."referrer" IS '유입 경로 (document.referrer)';



COMMENT ON COLUMN "public"."session_logs"."duration_seconds" IS '세션 지속 시간 (초)';



COMMENT ON COLUMN "public"."session_logs"."is_pwa" IS 'Whether this session was launched from PWA (standalone mode)';



COMMENT ON COLUMN "public"."session_logs"."pwa_display_mode" IS 'PWA display mode: standalone, fullscreen, minimal-ui, etc.';



CREATE TABLE IF NOT EXISTS "public"."shop_favorites" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shop_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shop_favorites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shop_favorites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shop_favorites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shop_favorites_id_seq" OWNED BY "public"."shop_favorites"."id";



CREATE TABLE IF NOT EXISTS "public"."shops" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "website_url" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "password" "text",
    "user_id" "uuid"
);


ALTER TABLE "public"."shops" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shops_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shops_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shops_id_seq" OWNED BY "public"."shops"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."site_analytics_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."site_analytics_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."site_analytics_logs_id_seq" OWNED BY "public"."site_analytics_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."site_stats_index" (
    "id" bigint NOT NULL,
    "ref_date" "date" NOT NULL,
    "metric_type" "text" NOT NULL,
    "dim_cat" "text",
    "dim_genre" "text",
    "dim_venue" "text",
    "val" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reg_date" "date"
);


ALTER TABLE "public"."site_stats_index" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."site_stats_index_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."site_stats_index_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."site_stats_index_id_seq" OWNED BY "public"."site_stats_index"."id";



CREATE TABLE IF NOT EXISTS "public"."site_usage_stats" (
    "id" bigint NOT NULL,
    "logged_in_count" integer DEFAULT 0,
    "anonymous_count" integer DEFAULT 0,
    "total_count" integer DEFAULT 0,
    "admin_count" integer DEFAULT 0,
    "snapshot_time" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_usage_stats" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."site_usage_stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."site_usage_stats_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."site_usage_stats_id_seq" OWNED BY "public"."site_usage_stats"."id";



CREATE TABLE IF NOT EXISTS "public"."social_group_favorites" (
    "user_id" "uuid" NOT NULL,
    "group_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."social_group_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_groups" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "image_url" "text",
    "description" "text",
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "password" "text",
    "image_micro" "text",
    "image_thumbnail" "text",
    "image_medium" "text",
    "image_full" "text",
    "storage_path" "text",
    "address" "text",
    "link" "text",
    "recruit_content" "text",
    "recruit_contact" "text",
    "recruit_link" "text",
    "recruit_image" "text",
    CONSTRAINT "social_groups_type_check" CHECK (("type" = ANY (ARRAY['club'::"text", 'bar'::"text", 'etc'::"text"])))
);


ALTER TABLE "public"."social_groups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."social_groups"."image_micro" IS 'Optimized image URL - 100px';



COMMENT ON COLUMN "public"."social_groups"."image_thumbnail" IS 'Optimized image URL - 300px';



COMMENT ON COLUMN "public"."social_groups"."image_medium" IS 'Optimized image URL - 650px';



COMMENT ON COLUMN "public"."social_groups"."image_full" IS 'Optimized image URL - 1300px';



COMMENT ON COLUMN "public"."social_groups"."address" IS '장소/모임 위치 주소';



COMMENT ON COLUMN "public"."social_groups"."link" IS '관련 링크 (오픈채팅/홈페이지 등)';



ALTER TABLE "public"."social_groups" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."social_groups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."social_schedules" (
    "id" integer NOT NULL,
    "place_id" integer,
    "title" character varying(255) NOT NULL,
    "date" "date",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "text",
    "password" "text",
    "day_of_week" integer,
    "inquiry_contact" "text",
    "link_name" "text",
    "link_url" "text",
    "place_name" character varying(255),
    "address" "text",
    "category" character varying(50),
    "image_url" "text",
    "venue_id" "uuid",
    "group_id" integer,
    "image_micro" "text",
    "image_thumbnail" "text",
    "image_medium" "text",
    "image_full" "text",
    "v2_genre" "text",
    "v2_category" "text",
    "scope" "text" DEFAULT 'domestic'::"text",
    "views" integer DEFAULT 0
);


ALTER TABLE "public"."social_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."social_schedules"."date" IS 'Specific date for one-time schedules. NULL for weekly recurring schedules (use day_of_week instead).';



COMMENT ON COLUMN "public"."social_schedules"."day_of_week" IS '0=Sunday, 1=Monday, ..., 6=Saturday';



COMMENT ON COLUMN "public"."social_schedules"."link_name" IS 'Display name for the external link';



COMMENT ON COLUMN "public"."social_schedules"."link_url" IS 'External link URL for the schedule';



COMMENT ON COLUMN "public"."social_schedules"."image_url" IS 'URL or Storage path for the place/schedule image';



COMMENT ON COLUMN "public"."social_schedules"."venue_id" IS 'Link to the venues table for location details';



COMMENT ON COLUMN "public"."social_schedules"."v2_genre" IS 'v2 메인 페이지 노출을 위한 장르/분류명 (예: 동호회강습, 동호회정규강습)';



COMMENT ON COLUMN "public"."social_schedules"."v2_category" IS 'v2 필터링을 위한 카테고리 (예: club, class, event)';



COMMENT ON COLUMN "public"."social_schedules"."scope" IS '행사 범위 구분 (domestic: 국내, overseas: 국외)';



CREATE SEQUENCE IF NOT EXISTS "public"."social_schedules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."social_schedules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."social_schedules_id_seq" OWNED BY "public"."social_schedules"."id";



CREATE TABLE IF NOT EXISTS "public"."system_keys" (
    "id" integer NOT NULL,
    "public_key" "text" NOT NULL,
    "encrypted_private_key" "text" NOT NULL,
    "salt" "text" NOT NULL,
    "iv" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."system_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."theme_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "background_color" character varying(7) DEFAULT '#000000'::character varying,
    "calendar_bg_color" character varying(7) DEFAULT '#111827'::character varying,
    "event_list_bg_color" character varying(7) DEFAULT '#1f2937'::character varying,
    "event_list_outer_bg_color" character varying(7) DEFAULT '#111827'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "header_bg_color" character varying(7) DEFAULT '#1f2937'::character varying,
    "page_bg_color" character varying(7) DEFAULT '#111827'::character varying,
    CONSTRAINT "single_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."theme_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_impact_stats_view" WITH ("security_invoker"='true') AS
 WITH "post_stats" AS (
         SELECT "board_posts"."user_id",
            "count"(*) AS "count",
            "sum"("board_posts"."views") AS "views",
            "sum"("board_posts"."likes") AS "likes"
           FROM "public"."board_posts"
          WHERE ("board_posts"."is_hidden" = false)
          GROUP BY "board_posts"."user_id"
        ), "event_stats" AS (
         SELECT "events"."user_id",
            "count"(*) AS "count",
            "sum"("events"."views") AS "views"
           FROM "public"."events"
          GROUP BY "events"."user_id"
        )
 SELECT ("u"."user_id")::"uuid" AS "user_id",
    COALESCE("p"."count", (0)::bigint) AS "total_posts",
    COALESCE("p"."views", (0)::bigint) AS "total_post_views",
    COALESCE("p"."likes", (0)::bigint) AS "total_post_likes",
    COALESCE("e"."count", (0)::bigint) AS "total_events",
    COALESCE("e"."views", (0)::bigint) AS "total_event_views",
    (COALESCE("p"."views", (0)::bigint) + COALESCE("e"."views", (0)::bigint)) AS "total_combined_views"
   FROM (("public"."board_users" "u"
     LEFT JOIN "post_stats" "p" ON (("u"."user_id" = "p"."user_id")))
     LEFT JOIN "event_stats" "e" ON (("u"."user_id" = "e"."user_id")));


ALTER VIEW "public"."user_impact_stats_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "subscription" "jsonb" NOT NULL,
    "is_admin" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "pref_events" boolean DEFAULT true,
    "pref_class" boolean DEFAULT true,
    "endpoint" "text",
    "user_agent" "text",
    "pref_filter_tags" "text"[],
    "pref_clubs" boolean DEFAULT true,
    "pref_filter_class_genres" "text"[]
);


ALTER TABLE "public"."user_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tokens" (
    "user_id" "uuid" NOT NULL,
    "encrypted_token" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."user_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category" character varying(50) NOT NULL,
    "name" character varying(200) NOT NULL,
    "address" "text",
    "phone" character varying(50),
    "description" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb",
    "website_url" "text",
    "map_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "user_id" "uuid"
);


ALTER TABLE "public"."venues" OWNER TO "postgres";


COMMENT ON TABLE "public"."venues" IS 'Stores venue information for practice rooms, swing bars, and other locations';



COMMENT ON COLUMN "public"."venues"."category" IS 'Category of venue (e.g., 연습실, 스윙바)';



COMMENT ON COLUMN "public"."venues"."user_id" IS 'The user who registered this venue';



CREATE TABLE IF NOT EXISTS "public"."webzine_posts" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "content" "jsonb" NOT NULL,
    "cover_image" "text",
    "author_id" "uuid" NOT NULL,
    "is_published" boolean DEFAULT false,
    "views" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."webzine_posts" OWNER TO "postgres";


ALTER TABLE "public"."webzine_posts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."webzine_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."billboard_user_settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."billboard_user_settings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."board_posts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."board_posts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."board_prefixes_backup" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."board_prefixes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."board_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."board_users_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."deployments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deployments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."featured_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."featured_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."global_notices" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."global_notices_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."history_edges" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."history_edges_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."history_nodes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."history_nodes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."history_spaces" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."history_spaces_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."item_views" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."item_views_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."practice_room_favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."practice_room_favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."practice_rooms" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."practice_rooms_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pwa_installs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pwa_installs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shop_favorites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shop_favorites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shops" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shops_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."site_analytics_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."site_analytics_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."site_stats_index" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."site_stats_index_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."site_usage_stats" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."site_usage_stats_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."social_schedules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."social_schedules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billboard_settings"
    ADD CONSTRAINT "billboard_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billboard_user_settings"
    ADD CONSTRAINT "billboard_user_settings_billboard_user_id_key" UNIQUE ("billboard_user_id");



ALTER TABLE ONLY "public"."billboard_user_settings"
    ADD CONSTRAINT "billboard_user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billboard_users"
    ADD CONSTRAINT "billboard_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_admins"
    ADD CONSTRAINT "board_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."board_anonymous_comment_dislikes"
    ADD CONSTRAINT "board_anonymous_comment_dislikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_anonymous_comment_dislikes"
    ADD CONSTRAINT "board_anonymous_comment_dislikes_user_id_comment_id_key" UNIQUE ("user_id", "comment_id");



ALTER TABLE ONLY "public"."board_anonymous_comment_likes"
    ADD CONSTRAINT "board_anonymous_comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_anonymous_comment_likes"
    ADD CONSTRAINT "board_anonymous_comment_likes_user_id_comment_id_key" UNIQUE ("user_id", "comment_id");



ALTER TABLE ONLY "public"."board_anonymous_comments"
    ADD CONSTRAINT "board_anonymous_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_anonymous_dislikes"
    ADD CONSTRAINT "board_anonymous_dislikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_anonymous_likes"
    ADD CONSTRAINT "board_anonymous_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_anonymous_posts"
    ADD CONSTRAINT "board_anonymous_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_banned_words"
    ADD CONSTRAINT "board_banned_words_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_categories"
    ADD CONSTRAINT "board_categories_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."board_comment_dislikes"
    ADD CONSTRAINT "board_comment_dislikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_comment_dislikes"
    ADD CONSTRAINT "board_comment_dislikes_user_id_comment_id_key" UNIQUE ("user_id", "comment_id");



ALTER TABLE ONLY "public"."board_comment_likes"
    ADD CONSTRAINT "board_comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_comment_likes"
    ADD CONSTRAINT "board_comment_likes_user_id_comment_id_key" UNIQUE ("user_id", "comment_id");



ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "board_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_post_dislikes"
    ADD CONSTRAINT "board_post_dislikes_fingerprint_post_id_key" UNIQUE ("fingerprint", "post_id");



ALTER TABLE ONLY "public"."board_post_dislikes"
    ADD CONSTRAINT "board_post_dislikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_post_dislikes"
    ADD CONSTRAINT "board_post_dislikes_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."board_post_favorites"
    ADD CONSTRAINT "board_post_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_post_favorites"
    ADD CONSTRAINT "board_post_favorites_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."board_post_views"
    ADD CONSTRAINT "board_post_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_prefixes_backup"
    ADD CONSTRAINT "board_prefixes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_prefixes"
    ADD CONSTRAINT "board_prefixes_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_users"
    ADD CONSTRAINT "board_users_nickname_key" UNIQUE ("nickname");



ALTER TABLE ONLY "public"."board_users"
    ADD CONSTRAINT "board_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_users"
    ADD CONSTRAINT "board_users_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."crawl_history"
    ADD CONSTRAINT "crawl_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crawling_events"
    ADD CONSTRAINT "crawling_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crawling_events"
    ADD CONSTRAINT "crawling_events_sourceUrl_key" UNIQUE ("sourceUrl");



ALTER TABLE ONLY "public"."deployments"
    ADD CONSTRAINT "deployments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."featured_items"
    ADD CONSTRAINT "featured_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_notices"
    ADD CONSTRAINT "global_notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history_edges"
    ADD CONSTRAINT "history_edges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history_edges"
    ADD CONSTRAINT "history_edges_source_target_handle_key" UNIQUE ("source_id", "target_id", "source_handle", "target_handle");



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history_spaces"
    ADD CONSTRAINT "history_spaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."item_views"
    ADD CONSTRAINT "item_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_categories"
    ADD CONSTRAINT "learning_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_resources"
    ADD CONSTRAINT "learning_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_video_bookmarks"
    ADD CONSTRAINT "learning_video_bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metrics_cache"
    ADD CONSTRAINT "metrics_cache_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."metronome_presets"
    ADD CONSTRAINT "metronome_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metronome_presets"
    ADD CONSTRAINT "metronome_presets_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_room_favorites"
    ADD CONSTRAINT "practice_room_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_room_favorites"
    ADD CONSTRAINT "practice_room_favorites_user_id_practice_room_id_key" UNIQUE ("user_id", "practice_room_id");



ALTER TABLE ONLY "public"."practice_rooms"
    ADD CONSTRAINT "practice_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pwa_installs"
    ADD CONSTRAINT "pwa_installs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_session_id_unique" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."shop_favorites"
    ADD CONSTRAINT "shop_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shop_favorites"
    ADD CONSTRAINT "shop_favorites_user_id_shop_id_key" UNIQUE ("user_id", "shop_id");



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_analytics_logs"
    ADD CONSTRAINT "site_analytics_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_stats_index"
    ADD CONSTRAINT "site_stats_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_usage_stats"
    ADD CONSTRAINT "site_usage_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_group_favorites"
    ADD CONSTRAINT "social_group_favorites_pkey" PRIMARY KEY ("user_id", "group_id");



ALTER TABLE ONLY "public"."social_groups"
    ADD CONSTRAINT "social_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_schedules"
    ADD CONSTRAINT "social_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_keys"
    ADD CONSTRAINT "system_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."theme_settings"
    ADD CONSTRAINT "theme_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_post_views"
    ADD CONSTRAINT "unique_fingerprint_post_view" UNIQUE NULLS NOT DISTINCT ("fingerprint", "post_id");



ALTER TABLE ONLY "public"."board_post_views"
    ADD CONSTRAINT "unique_user_post_view" UNIQUE NULLS NOT DISTINCT ("user_id", "post_id");



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webzine_posts"
    ADD CONSTRAINT "webzine_posts_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "board_anonymous_dislikes_user_key" ON "public"."board_anonymous_dislikes" USING "btree" ("post_id", "user_id");



CREATE UNIQUE INDEX "board_anonymous_likes_user_key" ON "public"."board_anonymous_likes" USING "btree" ("post_id", "user_id");



CREATE INDEX "board_post_likes_post_id_idx" ON "public"."board_post_likes" USING "btree" ("post_id");



CREATE INDEX "board_post_likes_user_id_idx" ON "public"."board_post_likes" USING "btree" ("user_id");



CREATE INDEX "board_post_views_fingerprint_idx" ON "public"."board_post_views" USING "btree" ("fingerprint") WHERE ("fingerprint" IS NOT NULL);



CREATE INDEX "board_post_views_post_id_idx" ON "public"."board_post_views" USING "btree" ("post_id");



CREATE INDEX "board_post_views_user_id_idx" ON "public"."board_post_views" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_analytics_created_at" ON "public"."site_analytics_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_analytics_page_url" ON "public"."site_analytics_logs" USING "btree" ("page_url");



CREATE INDEX "idx_analytics_session_id" ON "public"."site_analytics_logs" USING "btree" ("session_id");



CREATE INDEX "idx_analytics_target_type" ON "public"."site_analytics_logs" USING "btree" ("target_type");



CREATE INDEX "idx_anonymous_comments_post_id" ON "public"."board_anonymous_comments" USING "btree" ("post_id");



COMMENT ON INDEX "public"."idx_anonymous_comments_post_id" IS '게시글별 댓글 조회 및 CASCADE 삭제 성능 최적화';



CREATE INDEX "idx_billboard_user_settings_user_id" ON "public"."billboard_user_settings" USING "btree" ("billboard_user_id");



CREATE INDEX "idx_board_admins_user_id" ON "public"."board_admins" USING "btree" ("user_id");



CREATE INDEX "idx_board_comments_created_at" ON "public"."board_comments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_board_comments_post_id" ON "public"."board_comments" USING "btree" ("post_id");



CREATE INDEX "idx_board_posts_category" ON "public"."board_posts" USING "btree" ("category");



CREATE INDEX "idx_board_posts_created_at" ON "public"."board_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_board_posts_prefix_id" ON "public"."board_posts" USING "btree" ("prefix_id");



CREATE INDEX "idx_board_posts_user_id" ON "public"."board_posts" USING "btree" ("user_id");



CREATE INDEX "idx_board_prefixes_category" ON "public"."board_prefixes_backup" USING "btree" ("board_category_code");



CREATE INDEX "idx_board_prefixes_category_clean" ON "public"."board_prefixes" USING "btree" ("board_category_code");



CREATE INDEX "idx_board_users_user_id" ON "public"."board_users" USING "btree" ("user_id");



CREATE INDEX "idx_events_category" ON "public"."events" USING "btree" ("category");



CREATE INDEX "idx_events_dates" ON "public"."events" USING "btree" ("start_date", "date", "end_date");



CREATE INDEX "idx_events_image_thumbnail" ON "public"."events" USING "btree" ("image_thumbnail");



CREATE INDEX "idx_events_user_id" ON "public"."events" USING "btree" ("user_id");



CREATE INDEX "idx_events_views" ON "public"."events" USING "btree" ("views" DESC);



CREATE INDEX "idx_featured_items_shop_id" ON "public"."featured_items" USING "btree" ("shop_id");



CREATE INDEX "idx_history_edges_source" ON "public"."history_edges" USING "btree" ("source_id");



CREATE INDEX "idx_history_edges_target" ON "public"."history_edges" USING "btree" ("target_id");



CREATE INDEX "idx_history_nodes_grid" ON "public"."history_nodes" USING "btree" ("grid_row", "grid_column");



CREATE INDEX "idx_history_nodes_owner_id" ON "public"."history_nodes" USING "btree" ("created_by");



CREATE INDEX "idx_history_nodes_year" ON "public"."history_nodes" USING "btree" ("year");



CREATE INDEX "idx_history_nodes_z_index" ON "public"."history_nodes" USING "btree" ("z_index");



CREATE INDEX "idx_history_spaces_owner_id" ON "public"."history_spaces" USING "btree" ("owner_id");



CREATE INDEX "idx_item_views_fingerprint" ON "public"."item_views" USING "btree" ("fingerprint") WHERE ("fingerprint" IS NOT NULL);



CREATE INDEX "idx_item_views_item" ON "public"."item_views" USING "btree" ("item_type", "item_id");



CREATE INDEX "idx_item_views_user_id" ON "public"."item_views" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_learning_categories_grid" ON "public"."learning_categories" USING "btree" ("grid_row", "grid_column");



CREATE INDEX "idx_learning_categories_order" ON "public"."learning_categories" USING "btree" ("order_index");



CREATE INDEX "idx_learning_categories_parent" ON "public"."learning_categories" USING "btree" ("parent_id");



CREATE INDEX "idx_learning_categories_unclassified" ON "public"."learning_categories" USING "btree" ("is_unclassified");



CREATE INDEX "idx_learning_categories_user_id" ON "public"."learning_categories" USING "btree" ("user_id");



CREATE INDEX "idx_learning_resources_attachment_url" ON "public"."learning_resources" USING "btree" ("attachment_url") WHERE ("attachment_url" IS NOT NULL);



CREATE INDEX "idx_learning_resources_category_id" ON "public"."learning_resources" USING "btree" ("category_id");



CREATE INDEX "idx_learning_resources_content" ON "public"."learning_resources" USING "gin" ("to_tsvector"('"english"'::"regconfig", COALESCE("content", ''::"text")));



CREATE INDEX "idx_learning_resources_grid" ON "public"."learning_resources" USING "btree" ("grid_row", "grid_column");



CREATE INDEX "idx_learning_resources_type" ON "public"."learning_resources" USING "btree" ("type");



CREATE INDEX "idx_learning_resources_user_id" ON "public"."learning_resources" USING "btree" ("user_id");



CREATE INDEX "idx_learning_resources_year" ON "public"."learning_resources" USING "btree" ("year");



CREATE INDEX "idx_metronome_presets_user_id" ON "public"."metronome_presets" USING "btree" ("user_id");



CREATE INDEX "idx_notification_queue_schedule" ON "public"."notification_queue" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_practice_room_favorites_practice_room_id" ON "public"."practice_room_favorites" USING "btree" ("practice_room_id");



CREATE INDEX "idx_practice_room_favorites_user_id" ON "public"."practice_room_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_pwa_installs_fingerprint" ON "public"."pwa_installs" USING "btree" ("fingerprint");



CREATE INDEX "idx_pwa_installs_installed_at" ON "public"."pwa_installs" USING "btree" ("installed_at");



CREATE INDEX "idx_pwa_installs_session_id" ON "public"."pwa_installs" USING "btree" ("session_id");



CREATE INDEX "idx_pwa_installs_user_id" ON "public"."pwa_installs" USING "btree" ("user_id");



CREATE INDEX "idx_session_logs_clicks" ON "public"."session_logs" USING "btree" ("total_clicks");



CREATE INDEX "idx_session_logs_created_at_v3" ON "public"."session_logs" USING "btree" ("created_at");



CREATE INDEX "idx_session_logs_duration" ON "public"."session_logs" USING "btree" ("duration_seconds");



CREATE INDEX "idx_session_logs_fingerprint" ON "public"."session_logs" USING "btree" ("fingerprint");



CREATE INDEX "idx_session_logs_is_admin" ON "public"."session_logs" USING "btree" ("is_admin");



CREATE INDEX "idx_session_logs_is_pwa" ON "public"."session_logs" USING "btree" ("is_pwa");



CREATE INDEX "idx_session_logs_session_id" ON "public"."session_logs" USING "btree" ("session_id");



CREATE INDEX "idx_session_logs_session_id_v3" ON "public"."session_logs" USING "btree" ("session_id");



CREATE INDEX "idx_session_logs_session_start" ON "public"."session_logs" USING "btree" ("session_start");



CREATE INDEX "idx_session_logs_start" ON "public"."session_logs" USING "btree" ("session_start");



CREATE INDEX "idx_session_logs_user_id" ON "public"."session_logs" USING "btree" ("user_id");



CREATE INDEX "idx_shop_favorites_user_id" ON "public"."shop_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_shops_user_id" ON "public"."shops" USING "btree" ("user_id");



CREATE INDEX "idx_site_stats_metric" ON "public"."site_stats_index" USING "btree" ("metric_type");



CREATE INDEX "idx_site_stats_ref_date" ON "public"."site_stats_index" USING "btree" ("ref_date");



CREATE INDEX "idx_social_schedules_date" ON "public"."social_schedules" USING "btree" ("date");



CREATE INDEX "idx_social_schedules_user_id" ON "public"."social_schedules" USING "btree" ("user_id");



CREATE INDEX "idx_usage_snapshot_time" ON "public"."site_usage_stats" USING "btree" ("snapshot_time" DESC);



CREATE UNIQUE INDEX "idx_user_push_sub_user_endpoint" ON "public"."user_push_subscriptions" USING "btree" ("user_id", (("subscription" ->> 'endpoint'::"text")));



CREATE INDEX "idx_venues_category" ON "public"."venues" USING "btree" ("category") WHERE ("is_active" = true);



CREATE OR REPLACE TRIGGER "history_nodes_updated_at" BEFORE UPDATE ON "public"."history_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."update_history_nodes_updated_at"();



CREATE OR REPLACE TRIGGER "on_board_post_favorite_change" AFTER INSERT OR DELETE ON "public"."board_post_favorites" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_favorites_count"();



CREATE OR REPLACE TRIGGER "on_node_title_change" AFTER UPDATE OF "title" ON "public"."history_nodes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_title_change_tags"();



CREATE OR REPLACE TRIGGER "on_resource_title_change" AFTER UPDATE OF "title" ON "public"."learning_resources" FOR EACH ROW EXECUTE FUNCTION "public"."handle_title_change_tags"();



CREATE OR REPLACE TRIGGER "suppress_views_realtime" BEFORE UPDATE ON "public"."board_posts" FOR EACH ROW EXECUTE FUNCTION "public"."suppress_views_realtime"();



CREATE OR REPLACE TRIGGER "tr_anonymous_mutual_dislike" BEFORE INSERT ON "public"."board_anonymous_dislikes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_anonymous_mutual_dislike"();



CREATE OR REPLACE TRIGGER "tr_anonymous_mutual_like" BEFORE INSERT ON "public"."board_anonymous_likes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_anonymous_mutual_like"();



CREATE OR REPLACE TRIGGER "tr_check_post_dislikes" AFTER INSERT ON "public"."board_post_dislikes" FOR EACH ROW EXECUTE FUNCTION "public"."check_post_dislikes"();



CREATE OR REPLACE TRIGGER "tr_learning_categories_update" BEFORE UPDATE ON "public"."learning_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_timestamp"();



CREATE OR REPLACE TRIGGER "tr_sync_anon_comment_dislikes" AFTER INSERT OR DELETE ON "public"."board_anonymous_comment_dislikes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_comment_counts"();



CREATE OR REPLACE TRIGGER "tr_sync_anon_comment_likes" AFTER INSERT OR DELETE ON "public"."board_anonymous_comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_comment_counts"();



CREATE OR REPLACE TRIGGER "tr_sync_anonymous_comment_count" AFTER INSERT OR DELETE ON "public"."board_anonymous_comments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_anonymous_comment_count"();



CREATE OR REPLACE TRIGGER "tr_sync_anonymous_post_dislikes" AFTER INSERT OR DELETE ON "public"."board_anonymous_dislikes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_anonymous_post_dislikes"();



CREATE OR REPLACE TRIGGER "tr_sync_anonymous_post_likes" AFTER INSERT OR DELETE ON "public"."board_anonymous_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_anonymous_post_likes"();



CREATE OR REPLACE TRIGGER "tr_sync_comment_dislikes" AFTER INSERT OR DELETE ON "public"."board_comment_dislikes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_comment_counts"();



CREATE OR REPLACE TRIGGER "tr_sync_comment_likes" AFTER INSERT OR DELETE ON "public"."board_comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_comment_counts"();



CREATE OR REPLACE TRIGGER "tr_sync_post_likes" AFTER INSERT OR DELETE ON "public"."board_post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_post_likes"();



CREATE OR REPLACE TRIGGER "trigger_metronome_presets_updated_at" BEFORE UPDATE ON "public"."metronome_presets" FOR EACH ROW EXECUTE FUNCTION "public"."update_metronome_presets_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_comment_count_delete" AFTER DELETE ON "public"."board_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_comment_count"();



CREATE OR REPLACE TRIGGER "trigger_update_comment_count_insert" AFTER INSERT ON "public"."board_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_comment_count"();



CREATE OR REPLACE TRIGGER "update_billboard_settings_updated_at" BEFORE UPDATE ON "public"."billboard_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_billboard_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_billboard_user_settings_updated_at" BEFORE UPDATE ON "public"."billboard_user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_featured_items_updated_at" BEFORE UPDATE ON "public"."featured_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_global_notices_updated_at" BEFORE UPDATE ON "public"."global_notices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_shops_updated_at" BEFORE UPDATE ON "public"."shops" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_social_groups_updated_at" BEFORE UPDATE ON "public"."social_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_social_schedules_updated_at" BEFORE UPDATE ON "public"."social_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."user_push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."billboard_user_settings"
    ADD CONSTRAINT "billboard_user_settings_billboard_user_id_fkey" FOREIGN KEY ("billboard_user_id") REFERENCES "public"."billboard_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_admins"
    ADD CONSTRAINT "board_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_comment_dislikes"
    ADD CONSTRAINT "board_anonymous_comment_dislikes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."board_anonymous_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_comment_dislikes"
    ADD CONSTRAINT "board_anonymous_comment_dislikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_comment_likes"
    ADD CONSTRAINT "board_anonymous_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."board_anonymous_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_comment_likes"
    ADD CONSTRAINT "board_anonymous_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_comments"
    ADD CONSTRAINT "board_anonymous_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_anonymous_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_dislikes"
    ADD CONSTRAINT "board_anonymous_dislikes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_anonymous_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_dislikes"
    ADD CONSTRAINT "board_anonymous_dislikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_likes"
    ADD CONSTRAINT "board_anonymous_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_anonymous_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_anonymous_likes"
    ADD CONSTRAINT "board_anonymous_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_comment_dislikes"
    ADD CONSTRAINT "board_comment_dislikes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."board_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_comment_dislikes"
    ADD CONSTRAINT "board_comment_dislikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_comment_likes"
    ADD CONSTRAINT "board_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."board_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_comment_likes"
    ADD CONSTRAINT "board_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_dislikes"
    ADD CONSTRAINT "board_post_dislikes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_dislikes"
    ADD CONSTRAINT "board_post_dislikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_favorites"
    ADD CONSTRAINT "board_post_favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_favorites"
    ADD CONSTRAINT "board_post_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_likes"
    ADD CONSTRAINT "board_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_views"
    ADD CONSTRAINT "board_post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_post_views"
    ADD CONSTRAINT "board_post_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_posts"
    ADD CONSTRAINT "board_posts_prefix_id_fkey" FOREIGN KEY ("prefix_id") REFERENCES "public"."board_prefixes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."board_prefixes_backup"
    ADD CONSTRAINT "board_prefixes_board_category_code_fkey" FOREIGN KEY ("board_category_code") REFERENCES "public"."board_categories"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_prefixes"
    ADD CONSTRAINT "board_prefixes_board_category_code_fkey1" FOREIGN KEY ("board_category_code") REFERENCES "public"."board_categories"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crawling_events"
    ADD CONSTRAINT "crawling_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deployments"
    ADD CONSTRAINT "deployments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."featured_items"
    ADD CONSTRAINT "featured_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_comments"
    ADD CONSTRAINT "fk_board_comments_post" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "fk_events_author" FOREIGN KEY ("user_id") REFERENCES "public"."board_users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_groups"
    ADD CONSTRAINT "fk_social_groups_author" FOREIGN KEY ("user_id") REFERENCES "public"."board_users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_schedules"
    ADD CONSTRAINT "fk_social_schedules_author" FOREIGN KEY ("user_id") REFERENCES "public"."board_users"("user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_edges"
    ADD CONSTRAINT "history_edges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_edges"
    ADD CONSTRAINT "history_edges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."history_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."history_edges"
    ADD CONSTRAINT "history_edges_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."history_nodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_linked_category_id_fkey" FOREIGN KEY ("linked_category_id") REFERENCES "public"."learning_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "public"."learning_resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_linked_playlist_id_fkey" FOREIGN KEY ("linked_playlist_id") REFERENCES "public"."learning_resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_linked_video_id_fkey" FOREIGN KEY ("linked_video_id") REFERENCES "public"."learning_resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_parent_node_id_fkey" FOREIGN KEY ("parent_node_id") REFERENCES "public"."history_nodes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_nodes"
    ADD CONSTRAINT "history_nodes_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."history_spaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."history_spaces"
    ADD CONSTRAINT "history_spaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_views"
    ADD CONSTRAINT "item_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_categories"
    ADD CONSTRAINT "learning_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."learning_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_categories"
    ADD CONSTRAINT "learning_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metronome_presets"
    ADD CONSTRAINT "metronome_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_room_favorites"
    ADD CONSTRAINT "practice_room_favorites_practice_room_id_fkey" FOREIGN KEY ("practice_room_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_room_favorites"
    ADD CONSTRAINT "practice_room_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pwa_installs"
    ADD CONSTRAINT "pwa_installs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_favorites"
    ADD CONSTRAINT "shop_favorites_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_favorites"
    ADD CONSTRAINT "shop_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shops"
    ADD CONSTRAINT "shops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."social_group_favorites"
    ADD CONSTRAINT "social_group_favorites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."social_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_group_favorites"
    ADD CONSTRAINT "social_group_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."social_schedules"
    ADD CONSTRAINT "social_schedules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."social_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_schedules"
    ADD CONSTRAINT "social_schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_push_subscriptions"
    ADD CONSTRAINT "user_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webzine_posts"
    ADD CONSTRAINT "webzine_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Admin can delete prefixes" ON "public"."board_prefixes_backup" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_app_meta_data" ->> 'is_admin'::"text"))::boolean = true)))));



CREATE POLICY "Admin can delete theme_settings" ON "public"."theme_settings" FOR DELETE USING (("public"."is_admin_user"() = true));



CREATE POLICY "Admin can insert prefixes" ON "public"."board_prefixes_backup" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_app_meta_data" ->> 'is_admin'::"text"))::boolean = true)))));



CREATE POLICY "Admin can insert theme_settings" ON "public"."theme_settings" FOR INSERT WITH CHECK (("public"."is_admin_user"() = true));



CREATE POLICY "Admin can update prefixes" ON "public"."board_prefixes_backup" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_app_meta_data" ->> 'is_admin'::"text"))::boolean = true)))));



CREATE POLICY "Admin can update theme_settings" ON "public"."theme_settings" FOR UPDATE USING (("public"."is_admin_user"() = true)) WITH CHECK (("public"."is_admin_user"() = true));



CREATE POLICY "Admin delete access" ON "public"."learning_video_bookmarks" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin insert access" ON "public"."learning_video_bookmarks" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin update access" ON "public"."learning_video_bookmarks" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Admin write billboard_settings" ON "public"."billboard_settings" USING (("public"."is_admin_user"() = true)) WITH CHECK (("public"."is_admin_user"() = true));



CREATE POLICY "Admin write billboard_users" ON "public"."billboard_users" USING (("public"."is_admin_user"() = true)) WITH CHECK (("public"."is_admin_user"() = true));



CREATE POLICY "Admins can do everything" ON "public"."webzine_posts" USING ((("auth"."uid"() IN ( SELECT "board_admins"."user_id"
   FROM "public"."board_admins")) OR (( SELECT "public"."get_user_admin_status"() AS "get_user_admin_status") = true)));



CREATE POLICY "Admins can manage notices" ON "public"."global_notices" USING ("public"."is_admin_user"()) WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "Admins can read all PWA installs" ON "public"."pwa_installs" FOR SELECT USING ((( SELECT "public"."get_user_admin_status"() AS "get_user_admin_status") = true));



CREATE POLICY "Admins can view all subscriptions" ON "public"."user_push_subscriptions" FOR SELECT USING (((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean = true) OR ("auth"."email"() = 'clown313@naver.com'::"text")));



CREATE POLICY "Admins can view all users for analytics" ON "public"."board_users" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow Service Role Full Access" ON "public"."system_keys" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow Service Role Full Access" ON "public"."user_tokens" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow admin full access" ON "public"."board_prefixes_backup" USING (("auth"."uid"() IN ( SELECT "board_admins"."user_id"
   FROM "public"."board_admins")));



CREATE POLICY "Allow admin to manage stats" ON "public"."site_usage_stats" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow admin to read logs" ON "public"."site_analytics_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow admins to manage notification queue" ON "public"."notification_queue" USING ((( SELECT "public"."is_admin_user"() AS "is_admin_user") = true)) WITH CHECK ((( SELECT "public"."is_admin_user"() AS "is_admin_user") = true));



CREATE POLICY "Allow authenticated read board_admins" ON "public"."board_admins" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated to insert notification queue" ON "public"."notification_queue" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow public read" ON "public"."board_prefixes_backup" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."board_categories" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to deployments" ON "public"."deployments" FOR SELECT USING (true);



CREATE POLICY "Allow read access for all" ON "public"."board_admins" FOR SELECT USING (true);



CREATE POLICY "Allow service_role full access" ON "public"."notification_queue" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Allow super admin and public active users to read billboard use" ON "public"."billboard_users" FOR SELECT USING ((("is_active" = true) OR (("auth"."jwt"() ->> 'email'::"text") IS NOT NULL)));



CREATE POLICY "Allow_Admin_Manage_Admins" ON "public"."board_admins" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow_Public_Read_Admins" ON "public"."board_admins" FOR SELECT USING (true);



CREATE POLICY "Anon comment dislikes viewable by everyone" ON "public"."board_anonymous_comment_dislikes" FOR SELECT USING (true);



CREATE POLICY "Anon comment likes viewable by everyone" ON "public"."board_anonymous_comment_likes" FOR SELECT USING (true);



CREATE POLICY "Anonymous comments are viewable by everyone" ON "public"."board_anonymous_comments" FOR SELECT USING (true);



CREATE POLICY "Anonymous dislikes are viewable by everyone" ON "public"."board_anonymous_dislikes" FOR SELECT USING (true);



CREATE POLICY "Anonymous likes are viewable by everyone" ON "public"."board_anonymous_likes" FOR SELECT USING (true);



CREATE POLICY "Anonymous posts are viewable by everyone" ON "public"."board_anonymous_posts" FOR SELECT USING (true);



CREATE POLICY "Anyone can read invitations" ON "public"."invitations" FOR SELECT USING (true);



CREATE POLICY "Anyone can read posts" ON "public"."board_posts" FOR SELECT USING (true);



CREATE POLICY "Anyone can read prefixes" ON "public"."board_prefixes_backup" FOR SELECT USING (true);



CREATE POLICY "Anyone can read theme_settings" ON "public"."theme_settings" FOR SELECT USING (true);



CREATE POLICY "Anyone can view comments" ON "public"."board_comments" FOR SELECT USING (true);



CREATE POLICY "Anyone can view history edges" ON "public"."history_edges" FOR SELECT USING (true);



CREATE POLICY "Anyone can view history nodes" ON "public"."history_nodes" FOR SELECT USING (true);



CREATE POLICY "Anyone can view presets" ON "public"."metronome_presets" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create comments" ON "public"."board_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can insert" ON "public"."events" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert anonymous dislikes" ON "public"."board_anonymous_dislikes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can insert anonymous likes" ON "public"."board_anonymous_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can update app_settings" ON "public"."app_settings" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Banned words are viewable by everyone" ON "public"."board_banned_words" FOR SELECT USING (true);



CREATE POLICY "Comment dislikes viewable by everyone" ON "public"."board_comment_dislikes" FOR SELECT USING (true);



CREATE POLICY "Comment likes viewable by everyone" ON "public"."board_comment_likes" FOR SELECT USING (true);



CREATE POLICY "Comments are viewable by everyone" ON "public"."board_comments" FOR SELECT USING (true);



CREATE POLICY "Creators and Admins can delete edges" ON "public"."history_edges" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."board_admins"
  WHERE ("board_admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "Creators and Admins can update edges" ON "public"."history_edges" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."board_admins"
  WHERE ("board_admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "Creators can delete their nodes" ON "public"."history_nodes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Creators can update their nodes" ON "public"."history_nodes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Deny all mutations" ON "public"."board_admins" USING (false) WITH CHECK (false);



CREATE POLICY "Dislikes are viewable by everyone" ON "public"."board_post_dislikes" FOR SELECT USING (true);



CREATE POLICY "Enable all access for admins" ON "public"."history_nodes_backup_v7" USING (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR ("public"."is_admin_user"() = true) OR (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean = true)));



CREATE POLICY "Enable all access for admins" ON "public"."learning_categories" USING (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR ("public"."is_admin_user"() = true) OR (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean = true)));



CREATE POLICY "Enable all access for admins" ON "public"."learning_resources" USING (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR ("public"."is_admin_user"() = true) OR (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean = true)));



CREATE POLICY "Enable delete for admins" ON "public"."board_categories" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Enable delete for owners or legacy" ON "public"."shops" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



CREATE POLICY "Enable delete for shop owners" ON "public"."featured_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "featured_items"."shop_id") AND (("shops"."user_id" = "auth"."uid"()) OR ("shops"."user_id" IS NULL))))));



CREATE POLICY "Enable insert for admins" ON "public"."board_categories" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Enable insert for authenticated users only" ON "public"."featured_items" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."shops" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."board_categories" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."featured_items" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."learning_categories" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."learning_resources" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."shops" FOR SELECT USING (true);



CREATE POLICY "Enable read for all" ON "public"."crawling_events" FOR SELECT USING (true);



CREATE POLICY "Enable update for admins" ON "public"."board_categories" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Enable update for owners or legacy" ON "public"."shops" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



CREATE POLICY "Enable update for shop owners" ON "public"."featured_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."shops"
  WHERE (("shops"."id" = "featured_items"."shop_id") AND (("shops"."user_id" = "auth"."uid"()) OR ("shops"."user_id" IS NULL))))));



CREATE POLICY "Everyone can read app_settings" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Favorites are viewable by everyone" ON "public"."board_post_favorites" FOR SELECT USING (true);



CREATE POLICY "Favorites are viewable by everyone" ON "public"."social_group_favorites" FOR SELECT USING (true);



CREATE POLICY "Likes are viewable by everyone" ON "public"."board_post_likes" FOR SELECT USING (true);



CREATE POLICY "Only main admins can view all sessions" ON "public"."session_logs" FOR SELECT USING ((( SELECT "public"."get_user_admin_status"() AS "get_user_admin_status") = true));



CREATE POLICY "Owner or Admin can delete" ON "public"."events" FOR DELETE TO "authenticated" USING (((("auth"."uid"())::"text" = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Owner or Admin can update" ON "public"."events" FOR UPDATE TO "authenticated" USING (((("auth"."uid"())::"text" = "user_id") OR "public"."is_admin"())) WITH CHECK (((("auth"."uid"())::"text" = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Owner/Admin CRUD Access" ON "public"."metronome_presets" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Public Read" ON "public"."metrics_cache" FOR SELECT USING (true);



CREATE POLICY "Public billboard settings are viewable by everyone" ON "public"."billboard_settings" FOR SELECT USING (true);



CREATE POLICY "Public billboard settings are viewable by everyone" ON "public"."billboard_user_settings" FOR SELECT USING (true);



CREATE POLICY "Public can read active notices" ON "public"."global_notices" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can read published posts" ON "public"."webzine_posts" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public can view categories" ON "public"."learning_categories" FOR SELECT USING (true);



CREATE POLICY "Public can view events" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."learning_video_bookmarks" FOR SELECT USING (true);



CREATE POLICY "Public read billboard_settings" ON "public"."billboard_settings" FOR SELECT USING (true);



CREATE POLICY "Public read billboard_user_settings" ON "public"."billboard_user_settings" FOR SELECT USING (true);



CREATE POLICY "Public read billboard_users" ON "public"."billboard_users" FOR SELECT USING (true);



CREATE POLICY "Service Write" ON "public"."metrics_cache" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."board_users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to sessions" ON "public"."session_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Super admin can create invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("invited_by" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'email'::"text")));



CREATE POLICY "Super admin can update invitations" ON "public"."invitations" FOR UPDATE USING (("invited_by" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'email'::"text")));



CREATE POLICY "Users can delete own comments" ON "public"."board_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own events" ON "public"."events" FOR DELETE USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can delete own posts" ON "public"."board_posts" FOR DELETE USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can delete their own dislikes" ON "public"."board_anonymous_dislikes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own favorites" ON "public"."board_post_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own favorites" ON "public"."event_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own favorites" ON "public"."social_group_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own likes" ON "public"."board_anonymous_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own likes" ON "public"."board_post_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own practice room favorites" ON "public"."practice_room_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own shop favorites" ON "public"."shop_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own subscriptions" ON "public"."user_push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own favorites" ON "public"."board_post_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own favorites" ON "public"."event_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own favorites" ON "public"."social_group_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own likes" ON "public"."board_post_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own practice room favorites" ON "public"."practice_room_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own shop favorites" ON "public"."shop_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own subscriptions" ON "public"."user_push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own anon comment dislikes" ON "public"."board_anonymous_comment_dislikes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own anon comment likes" ON "public"."board_anonymous_comment_likes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own comment dislikes" ON "public"."board_comment_dislikes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own comment likes" ON "public"."board_comment_likes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own favorites" ON "public"."social_group_favorites" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see their own spaces" ON "public"."history_spaces" TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own billboard settings" ON "public"."billboard_user_settings" USING ((("billboard_user_id" = "auth"."uid"()) OR ("public"."is_admin_user"() = true))) WITH CHECK ((("billboard_user_id" = "auth"."uid"()) OR ("public"."is_admin_user"() = true)));



CREATE POLICY "Users can update own comments" ON "public"."board_comments" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("password" IS NOT NULL)));



CREATE POLICY "Users can update own events" ON "public"."events" FOR UPDATE USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can update own posts" ON "public"."board_posts" FOR UPDATE USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can update their own subscriptions" ON "public"."user_push_subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own favorites" ON "public"."event_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own favorites" ON "public"."social_group_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own practice room favorites" ON "public"."practice_room_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own shop favorites" ON "public"."shop_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own subscriptions" ON "public"."user_push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Views are viewable by everyone" ON "public"."board_post_views" FOR SELECT USING (true);



CREATE POLICY "Views are viewable by everyone" ON "public"."item_views" FOR SELECT USING (true);



CREATE POLICY "analytics_admin_select" ON "public"."site_analytics_logs" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "analytics_insert_all_v2" ON "public"."site_analytics_logs" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billboard_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billboard_user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billboard_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_anon_comments_insert_role" ON "public"."board_anonymous_comments" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



CREATE POLICY "board_anon_posts_insert_role" ON "public"."board_anonymous_posts" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



ALTER TABLE "public"."board_anonymous_comment_dislikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_anonymous_comment_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_anonymous_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_anonymous_dislikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_anonymous_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_anonymous_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_banned_words" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_comment_dislikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_comment_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_comments_insert_auth" ON "public"."board_comments" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."board_post_dislikes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_post_dislikes_insert_role" ON "public"."board_post_dislikes" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



ALTER TABLE "public"."board_post_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_post_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_post_views_insert_role" ON "public"."board_post_views" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



ALTER TABLE "public"."board_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_posts_admin_all" ON "public"."board_posts" USING ("public"."is_admin_user"());



CREATE POLICY "board_posts_insert_auth" ON "public"."board_posts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "board_posts_owner_delete" ON "public"."board_posts" FOR DELETE USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "board_posts_owner_update" ON "public"."board_posts" FOR UPDATE USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "board_posts_select_public" ON "public"."board_posts" FOR SELECT USING (true);



ALTER TABLE "public"."board_prefixes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_prefixes_all_master" ON "public"."board_prefixes" TO "authenticated" USING ("public"."is_admin_user"());



ALTER TABLE "public"."board_prefixes_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_prefixes_select_master" ON "public"."board_prefixes" FOR SELECT USING (true);



ALTER TABLE "public"."board_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "board_users_admin_all" ON "public"."board_users" USING ("public"."is_admin_user"());



CREATE POLICY "board_users_insert_self_or_admin" ON "public"."board_users" FOR INSERT WITH CHECK (((("auth"."uid"())::"text" = "user_id") OR "public"."is_admin_user"()));



CREATE POLICY "board_users_owner_modify" ON "public"."board_users" TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "board_users_select_master" ON "public"."board_users" FOR SELECT USING (true);



CREATE POLICY "board_users_select_public" ON "public"."board_users" FOR SELECT USING (true);



CREATE POLICY "board_users_update_master" ON "public"."board_users" FOR UPDATE TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text")) WITH CHECK (("user_id" = ("auth"."uid"())::"text"));



ALTER TABLE "public"."crawl_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crawl_history_admin_all" ON "public"."crawl_history" USING ("public"."is_admin_user"());



ALTER TABLE "public"."crawling_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crawling_events_admin_all" ON "public"."crawling_events" USING ("public"."is_admin_user"());



CREATE POLICY "crawling_events_owner_modify" ON "public"."crawling_events" TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "crawling_events_select_public" ON "public"."crawling_events" FOR SELECT USING (true);



ALTER TABLE "public"."deployments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deployments_admin_all" ON "public"."deployments" USING ("public"."is_admin_user"());



CREATE POLICY "deployments_owner_modify" ON "public"."deployments" TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."event_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_admin_all" ON "public"."events" USING ("public"."is_admin_user"());



CREATE POLICY "events_admin_delete_policy" ON "public"."events" FOR DELETE TO "authenticated" USING (((("auth"."uid"())::"text" = "user_id") OR "public"."check_is_admin"("auth"."uid"())));



CREATE POLICY "events_admin_update_policy" ON "public"."events" FOR UPDATE TO "authenticated" USING (((("auth"."uid"())::"text" = "user_id") OR "public"."check_is_admin"("auth"."uid"())));



CREATE POLICY "events_delete_master" ON "public"."events" FOR DELETE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



CREATE POLICY "events_delete_own_or_admin" ON "public"."events" FOR DELETE USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



CREATE POLICY "events_owner_modify" ON "public"."events" TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "events_select_master" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "events_select_public" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "events_update_master" ON "public"."events" FOR UPDATE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



CREATE POLICY "events_update_own_or_admin" ON "public"."events" FOR UPDATE USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



ALTER TABLE "public"."featured_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "featured_items_admin_all" ON "public"."featured_items" USING ("public"."is_admin_user"());



ALTER TABLE "public"."global_notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history_edges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "history_edges_insert_owner" ON "public"."history_edges" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") OR "public"."is_admin_user"()));



ALTER TABLE "public"."history_nodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history_nodes_backup_v7" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "history_nodes_insert_owner" ON "public"."history_nodes" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") OR "public"."is_admin_user"()));



ALTER TABLE "public"."history_spaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_views_insert_role" ON "public"."item_views" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



ALTER TABLE "public"."learning_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_categories_admin_all" ON "public"."learning_categories" USING ("public"."is_admin_user"());



CREATE POLICY "learning_categories_owner_modify" ON "public"."learning_categories" TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."learning_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_video_bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_video_bookmarks_admin_all" ON "public"."learning_video_bookmarks" USING ("public"."is_admin_user"());



CREATE POLICY "learning_video_bookmarks_select_public" ON "public"."learning_video_bookmarks" FOR SELECT USING (true);



ALTER TABLE "public"."metrics_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metronome_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "metronome_presets_delete_admin" ON "public"."metronome_presets" FOR DELETE TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "metronome_presets_insert_admin" ON "public"."metronome_presets" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "metronome_presets_select_all" ON "public"."metronome_presets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "metronome_presets_update_admin" ON "public"."metronome_presets" FOR UPDATE TO "authenticated" USING ("public"."is_admin_user"());



ALTER TABLE "public"."notification_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_room_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "practice_rooms_select_master" ON "public"."practice_rooms" FOR SELECT USING (true);



ALTER TABLE "public"."pwa_installs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pwa_installs_insert_owner" ON "public"."pwa_installs" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IS NULL)));



ALTER TABLE "public"."session_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_logs_insert_all" ON "public"."session_logs" FOR INSERT TO "anon", "authenticated" WITH CHECK (true);



CREATE POLICY "session_logs_insert_role" ON "public"."session_logs" FOR INSERT WITH CHECK (("auth"."role"() IS NOT NULL));



CREATE POLICY "session_logs_owner_modify" ON "public"."session_logs" TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "session_logs_select_admin" ON "public"."session_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "session_logs_select_all" ON "public"."session_logs" FOR SELECT TO "anon", "authenticated" USING (true);



CREATE POLICY "session_logs_update_owner" ON "public"."session_logs" FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shop_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shops_admin_all" ON "public"."shops" USING ("public"."is_admin_user"());



CREATE POLICY "shops_owner_modify" ON "public"."shops" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("user_id" IS NULL)));



CREATE POLICY "shops_select_public" ON "public"."shops" FOR SELECT USING (true);



ALTER TABLE "public"."site_analytics_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_usage_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_group_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_groups_admin_all" ON "public"."social_groups" USING ("public"."is_admin_user"());



CREATE POLICY "social_groups_delete_master" ON "public"."social_groups" FOR DELETE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



CREATE POLICY "social_groups_owner_modify" ON "public"."social_groups" TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "social_groups_select_master" ON "public"."social_groups" FOR SELECT USING (true);



CREATE POLICY "social_groups_update_master" ON "public"."social_groups" FOR UPDATE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



ALTER TABLE "public"."social_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_schedules_admin_all" ON "public"."social_schedules" USING ("public"."is_admin_user"());



CREATE POLICY "social_schedules_delete_master" ON "public"."social_schedules" FOR DELETE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



CREATE POLICY "social_schedules_owner_modify" ON "public"."social_schedules" TO "authenticated" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "social_schedules_select_master" ON "public"."social_schedules" FOR SELECT USING (true);



CREATE POLICY "social_schedules_update_master" ON "public"."social_schedules" FOR UPDATE TO "authenticated" USING ((("user_id" = ("auth"."uid"())::"text") OR "public"."is_admin_user"()));



ALTER TABLE "public"."system_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."theme_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "venues_admin_all" ON "public"."venues" USING ("public"."is_admin_user"());



CREATE POLICY "venues_delete_policy" ON "public"."venues" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin_user"()));



CREATE POLICY "venues_insert_policy" ON "public"."venues" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "venues_owner_modify" ON "public"."venues" TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "venues_select_policy" ON "public"."venues" FOR SELECT USING (("is_active" = true));



CREATE POLICY "venues_select_public" ON "public"."venues" FOR SELECT USING (("is_active" = true));



CREATE POLICY "venues_update_policy" ON "public"."venues" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin_user"()));



ALTER TABLE "public"."webzine_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "관리자는 모든 즐겨찾기 조회 가능" ON "public"."event_favorites" FOR SELECT USING (((((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean = true) OR (("auth"."jwt"() ->> 'email'::"text") = 'clown313@naver.com'::"text")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."billboard_user_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."board_anonymous_comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."board_anonymous_posts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."board_comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."board_posts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."board_users";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deployments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";









GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."add_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_is_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_post_dislikes"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_post_dislikes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_post_dislikes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_board_post"("p_title" "text", "p_content" "text", "p_author_name" "text", "p_user_id" "text", "p_author_nickname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_board_post"("p_title" "text", "p_content" "text", "p_author_name" "text", "p_user_id" "text", "p_author_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_board_post"("p_title" "text", "p_content" "text", "p_author_name" "text", "p_user_id" "text", "p_author_nickname" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_board_post"("p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_author_name" character varying, "p_author_nickname" character varying, "p_is_notice" boolean, "p_prefix_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_board_post"("p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_author_name" character varying, "p_author_nickname" character varying, "p_is_notice" boolean, "p_prefix_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_board_post"("p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_author_name" character varying, "p_author_nickname" character varying, "p_is_notice" boolean, "p_prefix_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_usage_snapshot"("p_logged_in" integer, "p_anonymous" integer, "p_admin" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_usage_snapshot"("p_logged_in" integer, "p_anonymous" integer, "p_admin" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_usage_snapshot"("p_logged_in" integer, "p_anonymous" integer, "p_admin" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_post_with_password"("p_post_id" bigint, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_post_with_password"("p_post_id" bigint, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_post_with_password"("p_post_id" bigint, "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_board_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_board_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_board_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_analytics_summary_v2"("start_date" "text", "end_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_analytics_summary_v2"("start_date" "text", "end_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_analytics_summary_v2"("start_date" "text", "end_date" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_board_static_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_static_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_static_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_board_user"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_board_user"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_board_user"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bootstrap_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_bootstrap_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bootstrap_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_kakao_user_info"("p_kakao_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_kakao_user_info"("p_kakao_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_kakao_user_info"("p_kakao_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_webzine_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_webzine_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_webzine_stats"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_board_user"("p_user_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_board_user"("p_user_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_board_user"("p_user_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_table_constraints"("t_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_table_constraints"("t_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_table_constraints"("t_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_admin_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_admin_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_admin_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_interactions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_interactions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_interactions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_today_views"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_today_views"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_today_views"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_dislike"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_dislike"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_dislike"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_anonymous_mutual_like_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_push_subscription"("p_endpoint" "text", "p_subscription" "jsonb", "p_user_agent" "text", "p_is_admin" boolean, "p_pref_events" boolean, "p_pref_class" boolean, "p_pref_clubs" boolean, "p_pref_filter_tags" "text"[], "p_pref_filter_class_genres" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."handle_push_subscription"("p_endpoint" "text", "p_subscription" "jsonb", "p_user_agent" "text", "p_is_admin" boolean, "p_pref_events" boolean, "p_pref_class" boolean, "p_pref_clubs" boolean, "p_pref_filter_tags" "text"[], "p_pref_filter_class_genres" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_push_subscription"("p_endpoint" "text", "p_subscription" "jsonb", "p_user_agent" "text", "p_is_admin" boolean, "p_pref_events" boolean, "p_pref_class" boolean, "p_pref_clubs" boolean, "p_pref_filter_tags" "text"[], "p_pref_filter_class_genres" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_title_change_tags"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_title_change_tags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_title_change_tags"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_withdrawal"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_withdrawal"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_withdrawal"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_item_views"("p_item_id" bigint, "p_item_type" "text", "p_user_id" "uuid", "p_fingerprint" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_item_views"("p_item_id" bigint, "p_item_type" "text", "p_user_id" "uuid", "p_fingerprint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_item_views"("p_item_id" bigint, "p_item_type" "text", "p_user_id" "uuid", "p_fingerprint" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_board_post_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_board_post_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_board_post_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."nuke_policies"("tbl_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."nuke_policies"("tbl_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nuke_policies"("tbl_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_site_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_site_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_site_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_site_stats_index"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_site_stats_index"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_site_stats_index"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" "text", "p_nickname" "text", "p_real_name" "text", "p_phone" "text", "p_gender" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" "text", "p_nickname" "text", "p_real_name" "text", "p_phone" "text", "p_gender" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" "text", "p_nickname" "text", "p_real_name" "text", "p_phone" "text", "p_gender" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" character varying, "p_nickname" character varying, "p_real_name" character varying, "p_phone" character varying, "p_gender" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" character varying, "p_nickname" character varying, "p_real_name" character varying, "p_phone" character varying, "p_gender" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_board_user"("p_user_id" character varying, "p_nickname" character varying, "p_real_name" character varying, "p_phone" character varying, "p_gender" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."suppress_views_realtime"() TO "anon";
GRANT ALL ON FUNCTION "public"."suppress_views_realtime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."suppress_views_realtime"() TO "service_role";



GRANT ALL ON FUNCTION "public"."suppress_views_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."suppress_views_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."suppress_views_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anonymous_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anonymous_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anonymous_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anonymous_post_dislikes"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anonymous_post_dislikes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anonymous_post_dislikes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anonymous_post_likes"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anonymous_post_likes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anonymous_post_likes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_comment_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_comment_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_comment_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_post_likes"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_post_likes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_post_likes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_fingerprint" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_fingerprint" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_fingerprint" "text", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_user_id" "uuid", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_user_id" "uuid", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_anonymous_interaction"("p_post_id" bigint, "p_user_id" "uuid", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_comment_interaction"("p_comment_id" "text", "p_type" "text", "p_is_anonymous" boolean, "p_fingerprint" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_comment_interaction"("p_comment_id" "text", "p_type" "text", "p_is_anonymous" boolean, "p_fingerprint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_comment_interaction"("p_comment_id" "text", "p_type" "text", "p_is_anonymous" boolean, "p_fingerprint" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text", "p_content" "text", "p_author_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text", "p_content" "text", "p_author_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_anonymous_comment_with_password"("p_comment_id" bigint, "p_password" "text", "p_content" "text", "p_author_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_nickname" "text", "p_image" "text", "p_image_thumbnail" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_nickname" "text", "p_image" "text", "p_image_thumbnail" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_anonymous_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_nickname" "text", "p_image" "text", "p_image_thumbnail" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_billboard_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_billboard_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_billboard_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_board_post"("p_post_id" integer, "p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_is_notice" boolean, "p_prefix_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_board_post"("p_post_id" integer, "p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_is_notice" boolean, "p_prefix_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_board_post"("p_post_id" integer, "p_user_id" character varying, "p_title" character varying, "p_content" "text", "p_is_notice" boolean, "p_prefix_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_history_nodes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_history_nodes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_history_nodes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_learning_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_learning_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_learning_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_metronome_presets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_metronome_presets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_metronome_presets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_favorites_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_favorites_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_favorites_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_author_name" "text", "p_image" "text", "p_image_thumbnail" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_author_name" "text", "p_image" "text", "p_image_thumbnail" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_with_password"("p_post_id" bigint, "p_password" "text", "p_title" "text", "p_content" "text", "p_author_name" "text", "p_image" "text", "p_image_thumbnail" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_social_event_with_password"("p_event_id" integer, "p_password" "text", "p_title" "text", "p_event_date" "date", "p_place_id" integer, "p_description" "text", "p_image_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_social_event_with_password"("p_event_id" integer, "p_password" "text", "p_title" "text", "p_event_date" "date", "p_place_id" integer, "p_description" "text", "p_image_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_social_event_with_password"("p_event_id" integer, "p_password" "text", "p_title" "text", "p_event_date" "date", "p_place_id" integer, "p_description" "text", "p_image_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" integer, "p_password" "text", "p_title" "text", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" integer, "p_password" "text", "p_title" "text", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" integer, "p_password" "text", "p_title" "text", "p_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" bigint, "p_password" "text", "p_title" "text", "p_date" "text", "p_start_time" "text", "p_end_time" "text", "p_description" "text", "p_day_of_week" integer, "p_inquiry_contact" "text", "p_link_name" "text", "p_link_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" bigint, "p_password" "text", "p_title" "text", "p_date" "text", "p_start_time" "text", "p_end_time" "text", "p_description" "text", "p_day_of_week" integer, "p_inquiry_contact" "text", "p_link_name" "text", "p_link_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_social_schedule_with_password"("p_schedule_id" bigint, "p_password" "text", "p_title" "text", "p_date" "text", "p_start_time" "text", "p_end_time" "text", "p_description" "text", "p_day_of_week" integer, "p_inquiry_contact" "text", "p_link_name" "text", "p_link_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_anonymous_post_password"("p_post_id" bigint, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_anonymous_post_password"("p_post_id" bigint, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_anonymous_post_password"("p_post_id" bigint, "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_post_password"("p_post_id" bigint, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_post_password"("p_post_id" bigint, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_post_password"("p_post_id" bigint, "p_password" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."site_analytics_logs" TO "anon";
GRANT ALL ON TABLE "public"."site_analytics_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."site_analytics_logs" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_daily_summary" TO "anon";
GRANT ALL ON TABLE "public"."analytics_daily_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_daily_summary" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_export_view" TO "anon";
GRANT ALL ON TABLE "public"."analytics_export_view" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_export_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_settings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."billboard_settings" TO "anon";
GRANT ALL ON TABLE "public"."billboard_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."billboard_settings" TO "service_role";



GRANT ALL ON TABLE "public"."billboard_user_settings" TO "anon";
GRANT ALL ON TABLE "public"."billboard_user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."billboard_user_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."billboard_user_settings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."billboard_user_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."billboard_user_settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."billboard_users" TO "anon";
GRANT ALL ON TABLE "public"."billboard_users" TO "authenticated";
GRANT ALL ON TABLE "public"."billboard_users" TO "service_role";



GRANT ALL ON TABLE "public"."board_admins" TO "anon";
GRANT ALL ON TABLE "public"."board_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."board_admins" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_comment_dislikes" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_comment_dislikes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_comment_dislikes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_dislikes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_dislikes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_dislikes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_comment_likes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comment_likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_comments" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_dislikes" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_dislikes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_dislikes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_dislikes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_dislikes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_dislikes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_likes" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_likes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_anonymous_posts" TO "anon";
GRANT ALL ON TABLE "public"."board_anonymous_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."board_anonymous_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_anonymous_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_anonymous_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_anonymous_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_banned_words" TO "anon";
GRANT ALL ON TABLE "public"."board_banned_words" TO "authenticated";
GRANT ALL ON TABLE "public"."board_banned_words" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_banned_words_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_banned_words_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_banned_words_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_categories" TO "anon";
GRANT ALL ON TABLE "public"."board_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."board_categories" TO "service_role";



GRANT ALL ON TABLE "public"."board_comment_dislikes" TO "anon";
GRANT ALL ON TABLE "public"."board_comment_dislikes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_comment_dislikes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_comment_dislikes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_comment_dislikes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_comment_dislikes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."board_comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_comment_likes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_comment_likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_comment_likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_comment_likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_comments" TO "anon";
GRANT ALL ON TABLE "public"."board_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."board_comments" TO "service_role";



GRANT ALL ON TABLE "public"."board_post_dislikes" TO "anon";
GRANT ALL ON TABLE "public"."board_post_dislikes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_post_dislikes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_post_dislikes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_post_dislikes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_post_dislikes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_post_favorites" TO "anon";
GRANT ALL ON TABLE "public"."board_post_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."board_post_favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_post_favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_post_favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_post_favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."board_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_post_likes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_post_likes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_post_likes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_post_likes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_post_views" TO "anon";
GRANT ALL ON TABLE "public"."board_post_views" TO "authenticated";
GRANT ALL ON TABLE "public"."board_post_views" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_post_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_post_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_post_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_posts" TO "anon";
GRANT ALL ON TABLE "public"."board_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."board_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_prefixes" TO "anon";
GRANT ALL ON TABLE "public"."board_prefixes" TO "authenticated";
GRANT ALL ON TABLE "public"."board_prefixes" TO "service_role";



GRANT ALL ON TABLE "public"."board_prefixes_backup" TO "anon";
GRANT ALL ON TABLE "public"."board_prefixes_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."board_prefixes_backup" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq1" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq1" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_prefixes_id_seq1" TO "service_role";



GRANT ALL ON TABLE "public"."board_users" TO "anon";
GRANT ALL ON TABLE "public"."board_users" TO "authenticated";
GRANT ALL ON TABLE "public"."board_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."crawl_history" TO "anon";
GRANT ALL ON TABLE "public"."crawl_history" TO "authenticated";
GRANT ALL ON TABLE "public"."crawl_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."crawl_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."crawl_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."crawl_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."crawling_events" TO "anon";
GRANT ALL ON TABLE "public"."crawling_events" TO "authenticated";
GRANT ALL ON TABLE "public"."crawling_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."crawling_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."crawling_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."crawling_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."deployments" TO "anon";
GRANT ALL ON TABLE "public"."deployments" TO "authenticated";
GRANT ALL ON TABLE "public"."deployments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deployments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deployments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deployments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_favorites" TO "anon";
GRANT ALL ON TABLE "public"."event_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."event_favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."event_favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."event_favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."event_favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."featured_items" TO "anon";
GRANT ALL ON TABLE "public"."featured_items" TO "authenticated";
GRANT ALL ON TABLE "public"."featured_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."featured_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."featured_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."featured_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."global_notices" TO "anon";
GRANT ALL ON TABLE "public"."global_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."global_notices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."global_notices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."global_notices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."global_notices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."history_edges" TO "anon";
GRANT ALL ON TABLE "public"."history_edges" TO "authenticated";
GRANT ALL ON TABLE "public"."history_edges" TO "service_role";



GRANT ALL ON SEQUENCE "public"."history_edges_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."history_edges_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."history_edges_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."history_nodes" TO "anon";
GRANT ALL ON TABLE "public"."history_nodes" TO "authenticated";
GRANT ALL ON TABLE "public"."history_nodes" TO "service_role";



GRANT ALL ON TABLE "public"."history_nodes_backup_v7" TO "anon";
GRANT ALL ON TABLE "public"."history_nodes_backup_v7" TO "authenticated";
GRANT ALL ON TABLE "public"."history_nodes_backup_v7" TO "service_role";



GRANT ALL ON SEQUENCE "public"."history_nodes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."history_nodes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."history_nodes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."history_spaces" TO "anon";
GRANT ALL ON TABLE "public"."history_spaces" TO "authenticated";
GRANT ALL ON TABLE "public"."history_spaces" TO "service_role";



GRANT ALL ON SEQUENCE "public"."history_spaces_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."history_spaces_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."history_spaces_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."item_views" TO "anon";
GRANT ALL ON TABLE "public"."item_views" TO "authenticated";
GRANT ALL ON TABLE "public"."item_views" TO "service_role";



GRANT ALL ON SEQUENCE "public"."item_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."item_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."item_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."learning_categories" TO "anon";
GRANT ALL ON TABLE "public"."learning_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_categories" TO "service_role";



GRANT ALL ON TABLE "public"."learning_resources" TO "anon";
GRANT ALL ON TABLE "public"."learning_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_resources" TO "service_role";



GRANT ALL ON TABLE "public"."learning_video_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."learning_video_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_video_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."metrics_cache" TO "anon";
GRANT ALL ON TABLE "public"."metrics_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."metrics_cache" TO "service_role";



GRANT ALL ON TABLE "public"."metronome_presets" TO "anon";
GRANT ALL ON TABLE "public"."metronome_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."metronome_presets" TO "service_role";



GRANT ALL ON TABLE "public"."notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notification_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notification_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notification_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."practice_room_favorites" TO "anon";
GRANT ALL ON TABLE "public"."practice_room_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_room_favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."practice_room_favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."practice_room_favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."practice_room_favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."practice_rooms" TO "anon";
GRANT ALL ON TABLE "public"."practice_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_rooms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."practice_rooms_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."practice_rooms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."practice_rooms_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pwa_installs" TO "anon";
GRANT ALL ON TABLE "public"."pwa_installs" TO "authenticated";
GRANT ALL ON TABLE "public"."pwa_installs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pwa_installs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pwa_installs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pwa_installs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."session_logs" TO "anon";
GRANT ALL ON TABLE "public"."session_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."session_logs" TO "service_role";



GRANT ALL ON TABLE "public"."shop_favorites" TO "anon";
GRANT ALL ON TABLE "public"."shop_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_favorites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shop_favorites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shop_favorites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shop_favorites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shops" TO "anon";
GRANT ALL ON TABLE "public"."shops" TO "authenticated";
GRANT ALL ON TABLE "public"."shops" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shops_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shops_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shops_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."site_analytics_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."site_analytics_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_analytics_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."site_stats_index" TO "anon";
GRANT ALL ON TABLE "public"."site_stats_index" TO "authenticated";
GRANT ALL ON TABLE "public"."site_stats_index" TO "service_role";



GRANT ALL ON SEQUENCE "public"."site_stats_index_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."site_stats_index_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_stats_index_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."site_usage_stats" TO "anon";
GRANT ALL ON TABLE "public"."site_usage_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."site_usage_stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."site_usage_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."site_usage_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_usage_stats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."social_group_favorites" TO "anon";
GRANT ALL ON TABLE "public"."social_group_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."social_group_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."social_groups" TO "anon";
GRANT ALL ON TABLE "public"."social_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."social_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."social_groups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."social_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."social_groups_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."social_schedules" TO "anon";
GRANT ALL ON TABLE "public"."social_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."social_schedules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."social_schedules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."social_schedules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."social_schedules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_keys" TO "anon";
GRANT ALL ON TABLE "public"."system_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."system_keys" TO "service_role";



GRANT ALL ON TABLE "public"."theme_settings" TO "anon";
GRANT ALL ON TABLE "public"."theme_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."theme_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_impact_stats_view" TO "anon";
GRANT ALL ON TABLE "public"."user_impact_stats_view" TO "authenticated";
GRANT ALL ON TABLE "public"."user_impact_stats_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."user_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";



GRANT ALL ON TABLE "public"."webzine_posts" TO "anon";
GRANT ALL ON TABLE "public"."webzine_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."webzine_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webzine_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webzine_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webzine_posts_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































