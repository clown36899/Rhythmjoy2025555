-- Migration for Social Weekly Schedule
-- Run this in the Supabase Dashboard SQL Editor

-- 1. Add columns to social_schedules for weekly repetition and extra info
ALTER TABLE social_schedules 
ADD COLUMN IF NOT EXISTS day_of_week INTEGER, -- 0=Sunday, 1=Monday, ... 6=Saturday
ADD COLUMN IF NOT EXISTS inquiry_contact TEXT,
ADD COLUMN IF NOT EXISTS link_name TEXT,
ADD COLUMN IF NOT EXISTS link_url TEXT;

-- 2. Add same columns to social_events if we want to support one-off events in the same style (Optional but recommended for consistency if we merge tables later)
-- For now we focus on social_schedules as per the "weekly" requirement.

COMMENT ON COLUMN social_schedules.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
