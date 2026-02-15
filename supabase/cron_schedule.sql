-- Enable pg_cron extension if not already enabled
-- Note: On some Supabase plans, you might need to enable this from the Dashboard > Database > Extensions
create extension if not exists pg_cron with schema extensions;

-- Unschedule existing job if it exists to prevent duplicates
select extensions.unschedule('daily-site-stats-refresh');

-- Schedule the job to run every day at 04:00 KST (19:00 UTC previous day)
-- Syntax: cron(job_name, schedule, command)
select extensions.cron(
    'daily-site-stats-refresh',
    '0 19 * * *', -- At 19:00 UTC (04:00 KST)
    $$
    select public.refresh_site_stats_index();
    $$
);

-- Check scheduled jobs
select * from extensions.cron.job;
