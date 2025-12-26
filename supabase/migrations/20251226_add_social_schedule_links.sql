-- Add link_url and link_name columns to social_schedules table
ALTER TABLE social_schedules
ADD COLUMN IF NOT EXISTS link_url text,
ADD COLUMN IF NOT EXISTS link_name text;

-- Add comment for documentation
COMMENT ON COLUMN social_schedules.link_url IS 'External link URL for the schedule';
COMMENT ON COLUMN social_schedules.link_name IS 'Display name for the external link';
