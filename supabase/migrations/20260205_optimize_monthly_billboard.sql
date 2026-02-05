-- Migration: Optimize Monthly Billboard Data Fetching (Strict Minimal Logic & Type Safe)
-- RPC Function: get_monthly_webzine_stats

create or replace function get_monthly_webzine_stats(
  start_date timestamptz,
  end_date timestamptz
)
returns json
language plpgsql
as $$
declare
  total_logs int;
  unique_visitors int;
  hourly_stats json;
  daily_traffic json;
  top_contents json;
begin
  -- 1. Total Logs & Unique Visitors
  -- [FIX] Cast user_id to text to avoid "invalid input syntax for type uuid" error
  select 
    count(*),
    count(distinct (
      coalesce(nullif(user_id::text, ''), nullif(fingerprint, ''), 'unknown') || ':' || 
      floor(extract(epoch from created_at) / 21600)
    ))
  into total_logs, unique_visitors
  from site_analytics_logs
  where created_at between start_date and end_date
    and is_admin = false
    and (user_id is null or user_id::text not like '91b04b25%');

  -- 2. Hourly Stats (Minimal Keywords)
  with calc_data as (
    select
      extract(hour from (created_at + interval '9 hours'))::int as hour,
      case 
        when target_type = 'class' or target_title like '%강습%' then 1 
        else 0 
      end as is_class,
      case 
        when target_type = 'event' or target_title like '%파티%' or target_title like '%소셜%' or target_title like '%행사%' then 1 
        else 0 
      end as is_event
    from site_analytics_logs
    where created_at between start_date and end_date
      and is_admin = false
      and (user_id is null or user_id::text not like '91b04b25%')
  )
  select json_agg(row_to_json(t))
  into hourly_stats
  from (
    select 
      hour,
      sum(is_class) as class_count,
      sum(is_event) as event_count
    from calc_data
    group by hour
    order by hour
  ) t;

  -- 3. Daily Traffic
  select json_agg(row_to_json(t))
  into daily_traffic
  from (
    select 
      extract(dow from (created_at + interval '9 hours'))::int as day,
      count(*) as count
    from site_analytics_logs
    where created_at between start_date and end_date
      and is_admin = false
      and (user_id is null or user_id::text not like '91b04b25%')
    group by 1
    order by 1
  ) t;

  -- 4. Top Contents
  select json_agg(row_to_json(t))
  into top_contents
  from (
    select
      target_type as type,
      target_title as title,
      count(*) as count
    from site_analytics_logs
    where created_at between start_date and end_date
      and is_admin = false
      and (user_id is null or user_id::text not like '91b04b25%')
      and target_type in ('class', 'event')
    group by target_type, target_title
    order by count(*) desc
    limit 20
  ) t;

  return json_build_object(
    'meta', json_build_object(
      'totalLogs', coalesce(total_logs, 0),
      'uniqueVisitors', coalesce(unique_visitors, 0)
    ),
    'hourlyStats', coalesce(hourly_stats, '[]'::json),
    'dailyTraffic', coalesce(daily_traffic, '[]'::json),
    'topContents', coalesce(top_contents, '[]'::json)
  );
end;
$$;
