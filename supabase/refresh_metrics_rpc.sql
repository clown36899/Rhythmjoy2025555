create or replace function public.refresh_site_metrics()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_member_count int;
  v_pwa_count int;
  v_push_count int;
  v_event_total int;
  v_event_avg numeric;
  v_breakdown_reg int;
  v_breakdown_social int;
  v_result jsonb;
  v_now timestamptz := now();
  -- 한국 시간 기준 날짜 계산
  v_kr_now timestamptz := now() + interval '9 hours';
  v_start_of_month date := date_trunc('month', v_kr_now)::date;
  v_end_of_month date := (date_trunc('month', v_kr_now) + interval '1 month' - interval '1 day')::date;
  v_days_passed int := extract(day from v_kr_now)::int;
begin
  -- 1. 회원 수 집계
  select count(*) into v_member_count from public.board_users;

  -- 2. PWA 유니크 설치 수
  select count(distinct user_id) into v_pwa_count from public.pwa_installs where user_id is not null;

  -- 3. Push 유니크 구독 수
  select count(distinct user_id) into v_push_count from public.user_push_subscriptions where user_id is not null;

  -- 4. 이벤트 전체 누적 (게시판/공지 제외)
  select count(*) into v_breakdown_reg
  from public.events
  where category not in ('notice', 'notice_popup', 'board');

  select count(*) into v_breakdown_social
  from public.social_schedules
  where date is not null or day_of_week is not null;

  v_event_total := v_breakdown_reg + v_breakdown_social;

  -- 5. 이번 달 일평균 (Daily Avg) - 근사치 계산
  -- JS 로직과 최대한 비슷하게: 시작일이 이번 달인 이벤트 + (활동일이 이번 달 OR 이번 달에 생성된 반복 소셜)
  with m_events as (
    select count(*) as c from public.events 
    where category not in ('notice', 'notice_popup', 'board') 
    and start_date >= v_start_of_month and start_date <= v_end_of_month
  ),
  m_socials as (
    select count(*) as c from public.social_schedules
    where (date >= v_start_of_month and date <= v_end_of_month)
    or (day_of_week is not null and created_at >= v_start_of_month and created_at < v_end_of_month + interval '1 day')
  )
  select round(((select c from m_events) + (select c from m_socials))::numeric / greatest(1, v_days_passed), 1)
  into v_event_avg;

  -- 결과 JSON 생성
  v_result := jsonb_build_object(
    'memberCount', v_member_count,
    'pwaCount', v_pwa_count,
    'pushCount', v_push_count,
    'eventCountTotal', v_event_total,
    'eventDailyAvg', v_event_avg,
    'eventBreakdown', jsonb_build_object('regular', v_breakdown_reg, 'social', v_breakdown_social),
    'calculatedAt', v_now
  );

  -- Cache 테이블에 저장 (Insert or Update)
  insert into public.metrics_cache (key, value, updated_at)
  values ('layout_summary', v_result, v_now)
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  return v_result;
end;
$$;

-- RLS 정책: 인증된 사용자도 이 RPC를 호출할 수 있게 허용할지 여부
-- 기본적으로 Postgres 함수는 public 권한이 있으나, security definer로 인해 생성자 권한으로 실행됨.
-- Lazy Trigger를 위해 Anon/Authenticated에게 실행 권한 부여
grant execute on function public.refresh_site_metrics() to anon, authenticated, service_role;
