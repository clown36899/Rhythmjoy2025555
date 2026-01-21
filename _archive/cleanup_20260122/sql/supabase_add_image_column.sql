-- Add image column to social_schedules table
-- This column will store the path to the image in Supabase Storage or a full URL

ALTER TABLE social_schedules 
ADD COLUMN IF NOT EXISTS image TEXT;

-- Optional: Add a comment to describe the column
COMMENT ON COLUMN social_schedules.image IS 'URL or Storage path for the place/schedule image';
