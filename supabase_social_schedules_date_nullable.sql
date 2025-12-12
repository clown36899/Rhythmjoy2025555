-- Make date column nullable in social_schedules table
-- This allows weekly schedules (with day_of_week) to not require a specific date
-- Run this in the Supabase Dashboard SQL Editor

ALTER TABLE social_schedules 
ALTER COLUMN date DROP NOT NULL;

COMMENT ON COLUMN social_schedules.date IS 'Specific date for one-time schedules. NULL for weekly recurring schedules (use day_of_week instead).';
