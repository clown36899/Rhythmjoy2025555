-- Calendar dance scope task: dry-run classification
-- This script only previews inferred values. It does not update public.events.

with classified as (
  select
    id,
    title,
    category,
    genre,
    case
      when coalesce(genre, '') ~* '(린디|lindy|스윙|swing|지터벅|jitterbug|발보아|balboa|블루스|blues|솔로.?재즈|solo.?jazz|west coast|wcs|웨스트.?코스트|웨코)' then 'swing'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(탱고|tango|밀롱가|milonga|프랙티카|practica)' then 'tango'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(바차타|bachata)' then 'bachata'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(살사|salsa)' then 'salsa'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(힙합|hip.?hop|왁킹|waack|팝핑|popping|락킹|locking|하우스|house|브레이킹|breaking|비보잉|bboy|크럼프|krump)' then 'street'
      else 'unknown'
    end as inferred_dance_scope,
    case
      when category in ('class', 'regular', 'club') then 'class'
      when category = 'social' or coalesce(genre, '') ~* '(소셜|social)' then 'social'
      when coalesce(title, '') || ' ' || coalesce(genre, '') ~* '(모집|오디션|audition|recruit)' then 'recruit'
      else 'event'
    end as inferred_activity_type
  from public.events
)
select
  inferred_dance_scope,
  inferred_activity_type,
  count(*) as count
from classified
group by inferred_dance_scope, inferred_activity_type
order by inferred_dance_scope, inferred_activity_type;

-- Inspect unknown rows before applying any backfill.
with classified as (
  select
    id,
    title,
    category,
    genre,
    case
      when coalesce(genre, '') ~* '(린디|lindy|스윙|swing|지터벅|jitterbug|발보아|balboa|블루스|blues|솔로.?재즈|solo.?jazz|west coast|wcs|웨스트.?코스트|웨코)' then 'swing'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(탱고|tango|밀롱가|milonga|프랙티카|practica)' then 'tango'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(바차타|bachata)' then 'bachata'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(살사|salsa)' then 'salsa'
      when coalesce(genre, '') || ' ' || coalesce(title, '') ~* '(힙합|hip.?hop|왁킹|waack|팝핑|popping|락킹|locking|하우스|house|브레이킹|breaking|비보잉|bboy|크럼프|krump)' then 'street'
      else 'unknown'
    end as inferred_dance_scope
  from public.events
)
select id, title, category, genre
from classified
where inferred_dance_scope = 'unknown'
order by id desc
limit 80;
