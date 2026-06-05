-- Visitor analytics accuracy/security cleanup
-- 기준:
-- - 고유 방문자: user_id 우선, 비로그인은 fingerprint 기준. 같은 fingerprint가 기간 내 user_id와 연결되면 회원으로 스티칭.
-- - 세션: 30분 비활동 기준. 체류시간은 30분 상한으로 보정.
-- - 관리자/테스트 계정/명시적 bot user-agent는 운영 통계에서 제외.

update public.session_logs
set duration_seconds = 1800,
    updated_at = now()
where duration_seconds is not null
  and duration_seconds > 1800;

update public.session_logs
set page_views = 1,
    updated_at = now()
where page_views is null
   or page_views < 1;

create or replace function public.get_analytics_summary_v2(start_date text, end_date text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  v_start timestamptz := start_date::timestamptz;
  v_end timestamptz := end_date::timestamptz;
  v_excluded_prefix text := '91b04b25';
  v_bot_pattern text := '(bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|curl|wget|python-requests)';
begin
  with valid_sessions as (
    select
      session_id,
      user_id,
      fingerprint,
      session_start,
      least(greatest(coalesce(duration_seconds, 0), 0), 1800) as duration_seconds
    from public.session_logs
    where session_start >= v_start
      and session_start <= v_end
      and coalesce(is_admin, false) = false
      and (user_id is null or user_id not like v_excluded_prefix || '%')
      and (user_agent is null or user_agent !~* v_bot_pattern)
  ),
  valid_logs as (
    select
      id,
      session_id,
      user_id,
      fingerprint,
      created_at
    from public.site_analytics_logs
    where created_at >= v_start
      and created_at <= v_end
      and coalesce(is_admin, false) = false
      and (user_id is null or user_id::text not like v_excluded_prefix || '%')
      and (user_agent is null or user_agent !~* v_bot_pattern)
  ),
  fp_to_user as (
    select distinct fingerprint, user_id
    from (
      select fingerprint, user_id from valid_sessions where fingerprint is not null and user_id is not null
      union all
      select fingerprint, user_id::text from valid_logs where fingerprint is not null and user_id is not null
    ) stitched
  ),
  visitor_rows as (
    select
      coalesce(
        'user:' || vs.user_id,
        case when ftu.user_id is not null then 'user:' || ftu.user_id end,
        case when vs.fingerprint is not null then 'guest:' || vs.fingerprint end,
        'guest_session:' || vs.session_id
      ) as visitor_key,
      vs.session_start as seen_at
    from valid_sessions vs
    left join fp_to_user ftu on ftu.fingerprint = vs.fingerprint
    union all
    select
      coalesce(
        'user:' || vl.user_id::text,
        case when ftu.user_id is not null then 'user:' || ftu.user_id end,
        case when vl.fingerprint is not null then 'guest:' || vl.fingerprint end,
        'guest_activity:' || vl.id::text
      ) as visitor_key,
      vl.created_at as seen_at
    from valid_logs vl
    left join fp_to_user ftu on ftu.fingerprint = vl.fingerprint
  ),
  visitor_stats as (
    select visitor_key, min(seen_at) as first_seen, max(seen_at) as last_seen
    from visitor_rows
    group by visitor_key
  ),
  user_stats as (
    select
      user_id,
      count(*) as visit_count,
      array_agg(session_start order by session_start desc) as visit_logs,
      avg(duration_seconds) filter (where duration_seconds > 0) as avg_duration
    from valid_sessions
    where user_id is not null
    group by user_id
  )
  select json_build_object(
    'total_visits', (select count(*) from visitor_stats),
    'logged_in_visits', (select count(*) from visitor_stats where visitor_key like 'user:%'),
    'anonymous_visits', (select count(*) from visitor_stats where visitor_key not like 'user:%'),
    'user_list', (
      select coalesce(json_agg(
        json_build_object(
          'user_id', us.user_id,
          'visitCount', us.visit_count,
          'visitLogs', us.visit_logs,
          'nickname', u.nickname,
          'avgDuration', coalesce(us.avg_duration, 0)
        ) order by us.visit_count desc
      ), '[]'::json)
      from user_stats us
      left join public.board_users u on us.user_id::text = u.user_id::text
    )
  ) into result;

  return result;
end;
$$;

comment on function public.get_analytics_summary_v2(text, text)
is 'Visitor analytics v2.1: session/log union, user/fingerprint stitching, bot/admin/test exclusion, 30m duration cap.';

drop policy if exists "session_logs_select_all" on public.session_logs;
drop policy if exists "session_logs_insert_all" on public.session_logs;
drop policy if exists "session_logs_insert_role" on public.session_logs;
drop policy if exists "session_logs_update_owner" on public.session_logs;

drop policy if exists "session_logs_select_admin" on public.session_logs;
create policy "session_logs_select_admin"
on public.session_logs
for select
to authenticated
using (public.is_admin_user());

drop policy if exists "session_logs_owner_modify" on public.session_logs;
create policy "session_logs_owner_modify"
on public.session_logs
for select
to authenticated
using (user_id = auth.uid()::text);
