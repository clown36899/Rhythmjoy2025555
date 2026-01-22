-- [New RPC Function] Server-side Analytics Aggregation with 6-Hour Deduplication
-- This bypasses the 1000-row limit and ensures accurate "Visitor" counts (valid 6-hour sessions).

create or replace function get_analytics_summary_v2(
  start_date text,
  end_date text
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
  v_start timestamptz;
  v_end timestamptz;
begin
  -- Convert text input to timestamptz (assuming input includes timezone or is UTC)
  v_start := start_date::timestamptz;
  v_end := end_date::timestamptz;

  with raw_data as (
    select
      user_id,
      fingerprint,
      created_at,
      -- Determine Identifier: UserID if present, else Fingerprint (Cast UUID to text)
      coalesce(user_id::text, fingerprint, 'unknown') as identifier,
      -- 6-Hour Bucket Calculation: integer division of epoch seconds
      floor(extract(epoch from created_at) / (21600)) as time_bucket
    from site_analytics_logs
    where created_at >= v_start 
      and created_at <= v_end
      and is_admin = false -- Exclude admin as per rules
  ),
  -- Deduplicate: Group by (Identifier + TimeBucket) to get unique "Visits"
  deduped_visits as (
    select distinct on (identifier, time_bucket)
      user_id,
      fingerprint,
      created_at
    from raw_data
    order by identifier, time_bucket, created_at
  ),
  -- User Stats: Aggregate stats for logged-in users from the deduped visits
  user_stats as (
    select
      user_id,
      count(*) as visit_count,
      array_agg(created_at order by created_at desc) as visit_logs
    from deduped_visits
    where user_id is not null
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
          'nickname', u.nickname
        ) order by us.visit_count desc
      ), '[]'::json)
      from user_stats us
      left join board_users u on us.user_id::text = u.user_id::text
    )
  ) into result;

  return result;
end;
$$;
