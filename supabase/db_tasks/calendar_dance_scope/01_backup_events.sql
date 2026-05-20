-- Calendar dance scope task: events table backup
-- Run this manually before any schema/backfill work on production.
-- This script does not modify public.events.

begin;

create table if not exists public.events_backup_before_dance_scope_20260520
(like public.events including all);

insert into public.events_backup_before_dance_scope_20260520
select e.*
from public.events e
where not exists (
  select 1
  from public.events_backup_before_dance_scope_20260520 b
  where b.id = e.id
);

comment on table public.events_backup_before_dance_scope_20260520
is 'Backup of public.events before calendar dance scope work. Created manually before schema/backfill changes.';

select
  'events_backup_before_dance_scope_20260520' as backup_table,
  (select count(*) from public.events) as source_count,
  (select count(*) from public.events_backup_before_dance_scope_20260520) as backup_count;

commit;
