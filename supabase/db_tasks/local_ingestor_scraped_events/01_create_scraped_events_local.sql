-- Local-only helper for running /admin/v2/ingestor against Supabase CLI.
-- Production already owns this table; do not apply this task to production.

create table if not exists public.scraped_events (
    id text primary key,
    keyword text,
    source_url text,
    poster_url text,
    extracted_text text,
    structured_data jsonb not null default '{}'::jsonb,
    is_collected boolean not null default false,
    status text,
    display_no integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists scraped_events_created_at_idx
    on public.scraped_events (created_at desc);

create index if not exists scraped_events_is_collected_idx
    on public.scraped_events (is_collected);

create index if not exists scraped_events_status_idx
    on public.scraped_events (status);

create index if not exists scraped_events_structured_date_idx
    on public.scraped_events ((structured_data->>'date'));

create index if not exists scraped_events_source_date_idx
    on public.scraped_events (source_url, (structured_data->>'date'));

insert into storage.buckets (id, name, public)
values ('scraped', 'scraped', true)
on conflict (id) do update set public = excluded.public;
