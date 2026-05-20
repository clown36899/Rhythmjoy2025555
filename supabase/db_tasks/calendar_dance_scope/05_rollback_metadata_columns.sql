-- Calendar dance scope task: rollback additive metadata columns
-- Use this if schema/backfill causes issues.
-- This rollback removes only the new metadata columns and indexes.
-- Existing core event data is not touched.

begin;

drop index if exists public.events_dance_scope_start_date_idx;
drop index if exists public.events_dance_scope_date_idx;

alter table public.events
  drop constraint if exists events_dance_scope_check;

alter table public.events
  drop constraint if exists events_activity_type_check;

alter table public.events
  drop column if exists dance_tags;

alter table public.events
  drop column if exists activity_type;

alter table public.events
  drop column if exists dance_genre;

alter table public.events
  drop column if exists dance_scope;

select
  'rollback_complete' as status,
  (select count(*) from public.events) as events_count,
  (select count(*) from public.events_backup_before_dance_scope_20260520) as backup_count;

commit;
