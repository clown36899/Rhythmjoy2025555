-- 기존 함수 삭제 (충돌 방지)
drop function if exists public.refresh_site_metrics();

create or replace function public.refresh_site_metrics()
returns jsonb
language plpgsql
security definer
as $$
declare
  _member_count bigint;
  _pwa_count bigint;
  _push_count bigint;
  _event_total bigint;
  _event_avg numeric;
  _breakdown_reg bigint;
  _breakdown_social bigint;
  _final_json jsonb;
  _now timestamptz := now();
  _kr_now timestamptz;
  _start_of_month date;
  _end_of_month date;
  _days_passed int;
begin
  -- 변수 초기화
  _kr_now := now() + interval '9 hours';
  _start_of_month := date_trunc('month', _kr_now)::date;
  _end_of_month := (date_trunc('month', _kr_now) + interval '1 month' - interval '1 day')::date;
  _days_passed := extract(day from _kr_now)::int;

  -- 1. 회원 수 집계
  select count(*) into _member_count from public.board_users;

  -- 2. PWA 유니크 설치 수
  select count(distinct user_id) into _pwa_count from public.pwa_installs where user_id is not null;

  -- 3. Push 유니크 구독 수
  select count(distinct user_id) into _push_count from public.user_push_subscriptions where user_id is not null;

  -- 4. 이벤트 전체 누적
  select count(*) into _breakdown_reg
  from public.events
  where category not in ('notice', 'notice_popup', 'board');

  select count(*) into _breakdown_social
  from public.social_schedules
  where date is not null or day_of_week is not null;

  _event_total := _breakdown_reg + _breakdown_social;

  -- 5. 이번 달 일평균
  with m_events as (
    select count(*) as c from public.events 
    where category not in ('notice', 'notice_popup', 'board') 
    and (start_date)::date >= _start_of_month and (start_date)::date <= _end_of_month
  ),
  m_socials as (
    select count(*) as c from public.social_schedules
    where ((date)::date >= _start_of_month and (date)::date <= _end_of_month)
    or (day_of_week is not null and created_at >= _start_of_month and created_at < _end_of_month + interval '1 day')
  )
  select round(((select c from m_events) + (select c from m_socials))::numeric / greatest(1, _days_passed), 1)
  into _event_avg;

  -- 결과 JSON 생성
  select jsonb_build_object(
    'memberCount', _member_count,
    'pwaCount', _pwa_count,
    'pushCount', _push_count,
    'eventCountTotal', _event_total,
    'eventDailyAvg', _event_avg,
    'eventBreakdown', jsonb_build_object('regular', _breakdown_reg, 'social', _breakdown_social),
    'calculatedAt', _now
  ) into _final_json;

  -- Cache 테이블에 저장 (명시적 컬럼 지정 및 EXCLUDED 사용)
  insert into public.metrics_cache (key, value, updated_at)
  values ('layout_summary', _final_json, _now)
  on conflict (key) do update
  set value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  return _final_json;
end;
$$;

-- 권한 재설정
grant execute on function public.refresh_site_metrics() to anon, authenticated, service_role;
