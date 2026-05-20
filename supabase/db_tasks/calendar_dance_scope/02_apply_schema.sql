-- Calendar dance scope task: additive schema only
-- Run only after 01_backup_events.sql reports matching counts.
-- This migration is intentionally additive: it does not alter title/date/category/genre.

begin;

alter table public.events add column if not exists dance_scope text;
alter table public.events add column if not exists dance_genre text;
alter table public.events add column if not exists activity_type text;
alter table public.events add column if not exists dance_tags jsonb default '[]'::jsonb;

alter table public.events
  drop constraint if exists events_dance_scope_check;

alter table public.events
  add constraint events_dance_scope_check
  check (
    dance_scope is null
    or dance_scope in ('swing', 'salsa', 'bachata', 'tango', 'street', 'unknown')
  );

alter table public.events
  drop constraint if exists events_activity_type_check;

alter table public.events
  add constraint events_activity_type_check
  check (
    activity_type is null
    or activity_type in ('class', 'social', 'event', 'recruit')
  );

create index if not exists events_dance_scope_start_date_idx
on public.events (dance_scope, start_date);

create index if not exists events_dance_scope_date_idx
on public.events (dance_scope, date);

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'events'
  and column_name in ('dance_scope', 'dance_genre', 'activity_type', 'dance_tags')
order by column_name;

commit;
