-- 1. Create Cache Table
create table if not exists public.metrics_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- 2. Enable RLS (and allow public read for now, or restrict to service role)
alter table public.metrics_cache enable row level security;

-- Allow public read (since we use it for layout stats) - or restrict if sensitive
create policy "Allow public read access"
  on public.metrics_cache for select
  using (true);

-- Allow service role full access
create policy "Allow service role full access"
  on public.metrics_cache
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3. (Optional) Grant access
grant select on public.metrics_cache to anon, authenticated;
grant all on public.metrics_cache to service_role;
