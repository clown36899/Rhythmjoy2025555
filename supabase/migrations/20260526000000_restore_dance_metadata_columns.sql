-- Restore dance metadata columns that were dropped during genre DB changes.
-- These columns were originally applied via db_tasks/calendar_dance_scope/02_apply_schema.sql
-- but never had a formal migration, causing them to be lost.

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
