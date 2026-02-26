-- Fix: get_analytics_summary_v2 의 session_duration_stats CTE에 is_admin 필터 누락 수정
-- 관리자 세션이 일반 사용자 평균 체류시간 계산에 포함되던 버그 해결

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
  -- [FIX] is_admin = false 추가 — 관리자 세션이 평균 체류시간에 섞이던 버그 수정
  session_duration_stats as (
    select
      user_id,
      avg(duration_seconds) as avg_duration
    from session_logs
    where duration_seconds is not null
      and duration_seconds > 0
      and is_admin = false
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
