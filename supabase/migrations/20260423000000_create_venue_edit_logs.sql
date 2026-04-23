create table if not exists venue_edit_logs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete set null,
  venue_name text,
  user_id uuid references auth.users(id) on delete set null,
  user_nickname text,
  action text not null, -- 'created' | 'updated' | 'deleted'
  changes jsonb,
  created_at timestamptz default now()
);

alter table venue_edit_logs enable row level security;

create policy "authenticated users can insert own log"
  on venue_edit_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "anyone can view logs"
  on venue_edit_logs for select
  using (true);
