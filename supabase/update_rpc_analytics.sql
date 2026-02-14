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
  
  -- Scene Analytics Variables
  _monthly_stats jsonb;
  _weekly_stats jsonb;
  _genre_stats jsonb;
  _scene_analytics jsonb;

  _layout_summary jsonb;
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

  -------------------------------------------------------------------------
  -- PART 1: Layout Summary (Hamburger Menu)
  -------------------------------------------------------------------------
  
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

  -- Layout Summary JSON 생성
  select jsonb_build_object(
    'memberCount', _member_count,
    'pwaCount', _pwa_count,
    'pushCount', _push_count,
    'eventCountTotal', _event_total,
    'eventDailyAvg', _event_avg,
    'eventBreakdown', jsonb_build_object('regular', _breakdown_reg, 'social', _breakdown_social),
    'calculatedAt', _now
  ) into _layout_summary;

  -- Insert Layout Summary Cache
  insert into public.metrics_cache (key, value, updated_at)
  values ('layout_summary', _layout_summary, _now)
  on conflict (key) do update
  set value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;


  -------------------------------------------------------------------------
  -- PART 2: Scene Analytics (Swing Scene Stats Page)
  -- 12개월치 데이터 집계 (복잡한 로직은 SQL로 단순화)
  -------------------------------------------------------------------------
  
  -- A. 월별 추이 (최근 12개월)
  -- Events와 Socials를 Union하여 월별 Group By
  with raw_data as (
    select 
      to_char((start_date)::date, 'YYYY-MM') as month_key,
      case 
        when category = 'class' then 'classes'
        when category = 'club' then 'clubs'
        else 'events' 
      end as type,
      1 as count
    from public.events
    where category not in ('notice', 'notice_popup', 'board')
      and (start_date)::date >= (date_trunc('month', _kr_now) - interval '12 months')::date
    
    union all
    
    select 
      to_char(coalesce((date)::date, created_at), 'YYYY-MM') as month_key,
      'socials' as type,
      1 as count
    from public.social_schedules
    where (date is not null or day_of_week is not null)
      and coalesce((date)::date, created_at) >= (date_trunc('month', _kr_now) - interval '12 months')::date
  )
  select jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'classes', coalesce(sum(case when type='classes' then 1 else 0 end), 0),
      'events', coalesce(sum(case when type='events' then 1 else 0 end), 0),
      'socials', coalesce(sum(case when type='socials' then 1 else 0 end), 0),
      'clubs', coalesce(sum(case when type='clubs' then 1 else 0 end), 0),
      'total', count(*)
    ) order by m.month_key
  )
  into _monthly_stats
  from raw_data m
  group by m.month_key;

  -- B. 요일별, 장르별 집계 (최근 12개월 전체) + (최근 1개월)
  -- (복잡도를 줄이기 위해 여기선 전체 1년치 통계만 예시로 계산하여 저장)
  -- 실무적으로는 상세 Inspector 데이터는 별도 API나 Lazy Loading을 하는게 낫지만,
  -- 일단 그래프용 요약 데이터만 저장.

  -- Scene Analytics JSON 생성 (Graph Data Only)
  select jsonb_build_object(
    'monthly', coalesce(_monthly_stats, '[]'::jsonb),
    'summary', jsonb_build_object(
        'totalItems', _event_total,
        'dailyAverage', _event_avg,
        'topDay', '분석중' -- SQL에서 요일 분석은 복잡하므로 일단 placeholder
    ),
    'calculatedAt', _now
  ) into _scene_analytics;

  -- Insert Scene Analytics Cache
  insert into public.metrics_cache (key, value, updated_at)
  values ('scene_analytics', _scene_analytics, _now)
  on conflict (key) do update
  set value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  return _layout_summary; -- Return layout summary for immediate use
end;
$$;

grant execute on function public.refresh_site_metrics() to anon, authenticated, service_role;
