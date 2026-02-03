-- Create notification queue table
create table if not exists notification_queue (
  id bigint generated always as identity primary key,
  event_id bigint references events(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null,
  payload jsonb,
  scheduled_at timestamptz not null,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Index for faster periodic queries
create index if not exists idx_notification_queue_schedule on notification_queue(status, scheduled_at);

-- RLS Policies
alter table notification_queue enable row level security;

-- Only service role (and potentially admin users) should manage queue
drop policy if exists "Allow service_role full access" on notification_queue;
create policy "Allow service_role full access" on notification_queue
  for all
  using ( auth.jwt() ->> 'role' = 'service_role' )
  with check ( auth.jwt() ->> 'role' = 'service_role' );

-- Allow authenticated users to insert
drop policy if exists "Allow authenticated insert" on notification_queue;
create policy "Allow authenticated insert" on notification_queue
  for insert
  to authenticated
  with check (true);

-- ==============================================================================
-- [CRON JOB SETUP]
-- 이 아래 쿼리를 실행하려면, 'YOUR_SUPABASE_SERVICE_ROLE_KEY' 부분을 실제 키로 바꿔야 합니다.
-- 키 위치: Supabase Dashboard > Project Settings > API > service_role (secret)
-- ==============================================================================

-- 1. Enable extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2. Schedule the job (Every 1 minute)
-- (cron.schedule은 같은 이름이 있으면 업데이트하므로 unschedule 불필요)

select cron.schedule(
  'process-notification-queue-every-min',
  '* * * * *', -- 매 1분마다 실행
  $$
    select
      net.http_post(
          url:='https://mkoryudscamnopvxdelk.supabase.co/functions/v1/process-notification-queue',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
  $$
);
