create or replace function get_analytics_summary_v2(start_date text,end_date text)returns json language plpgsql security definer as $func$
declare
result json;v_start timestamptz;v_end timestamptz;
begin
v_start:=start_date::timestamptz;v_end:=end_date::timestamptz;
with raw_data as (select user_id,fingerprint,created_at,coalesce(user_id::text,fingerprint,'unknown') as identifier,floor(extract(epoch from created_at)/21600) as time_bucket from site_analytics_logs where created_at>=v_start and created_at<=v_end and is_admin=false),
deduped_visits as (select distinct on (identifier,time_bucket) user_id,fingerprint,created_at from raw_data order by identifier,time_bucket,created_at),
user_stats as (select user_id,count(*) as visit_count,array_agg(created_at order by created_at desc) as visit_logs from deduped_visits where user_id is not null group by user_id),
click_durations as (select session_id,user_id,floor(extract(epoch from created_at)/21600) as time_bucket,extract(epoch from (max(created_at)-min(created_at))) as interaction_duration from site_analytics_logs where created_at>=v_start and created_at<=v_end and is_admin=false and session_id is not null group by session_id,user_id,time_bucket),
unified_sessions as (select coalesce(sl.user_id::text,cd.user_id::text) as user_id,greatest(coalesce(sl.duration_seconds,0),coalesce(cd.interaction_duration,0)) as final_duration from click_durations cd left join session_logs sl on cd.session_id=sl.session_id and sl.user_id::text=cd.user_id::text and sl.created_at>=to_timestamp(cd.time_bucket*21600) and sl.created_at<to_timestamp((cd.time_bucket+1)*21600) where coalesce(sl.user_id::text,cd.user_id::text) is not null),
session_duration_stats as (select user_id,avg(final_duration) as avg_duration from unified_sessions where final_duration>0 and final_duration<=21600 group by user_id)
select json_build_object('total_visits',(select count(*) from deduped_visits),'logged_in_visits',(select count(*) from deduped_visits where user_id is not null),'anonymous_visits',(select count(*) from deduped_visits where user_id is null),'user_list',(select coalesce(json_agg(json_build_object('user_id',us.user_id,'visitCount',us.visit_count,'visitLogs',us.visit_logs,'nickname',u.nickname,'avgDuration',coalesce(sd.avg_duration,0)) order by us.visit_count desc),'[]'::json) from user_stats us left join board_users u on us.user_id::text=u.user_id::text left join session_duration_stats sd on us.user_id::text = sd.user_id::text)) into result;
return result;
end;$func$;
