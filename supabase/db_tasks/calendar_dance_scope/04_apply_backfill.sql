-- Calendar dance scope task: apply metadata backfill
-- Preconditions:
-- 1. 01_backup_events.sql completed and source_count == backup_count.
-- 2. 02_apply_schema.sql completed.
-- 3. 03_dry_run_backfill.sql reviewed.
--
-- This script updates only the new metadata columns.
-- It must not update title, date, start_date, end_date, category, genre, or links.

begin;

update public.events
set
  dance_scope = case
    when coalesce(genre, '') ~* '(린디|lindy|스윙|swing|지터벅|jitterbug|발보아|balboa|블루스|blues|솔로.?재즈|solo.?jazz|west coast|wcs|웨스트.?코스트|웨코)' then 'swing'
    when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(탱고|tango|밀롱가|milonga|프랙티카|practica)' then 'tango'
    when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(바차타|bachata)' then 'bachata'
    when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(살사|salsa)' then 'salsa'
    when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(힙합|hip.?hop|왁킹|waack|팝핑|popping|락킹|locking|하우스|house|브레이킹|breaking|비보잉|bboy|크럼프|krump)' then 'street'
    else 'unknown'
  end,
  activity_type = case
    when category in ('class', 'regular', 'club') then 'class'
    when category = 'social' or coalesce(genre, '') ~* '(소셜|social)' then 'social'
    when coalesce(title, '') || ' ' || coalesce(genre, '') ~* '(모집|오디션|audition|recruit)' then 'recruit'
    else 'event'
  end,
  dance_genre = nullif(split_part(coalesce(genre, ''), ',', 1), ''),
  dance_tags = coalesce(dance_tags, '[]'::jsonb)
where dance_scope is null
   or activity_type is null
   or dance_genre is null
   or dance_tags is null;

select
  dance_scope,
  activity_type,
  count(*) as count
from public.events
group by dance_scope, activity_type
order by dance_scope, activity_type;

commit;
