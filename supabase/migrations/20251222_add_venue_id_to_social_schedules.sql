-- Add venue_id column to social_schedules table
-- This links social schedules to specific venues

ALTER TABLE social_schedules
ADD COLUMN venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

COMMENT ON COLUMN social_schedules.venue_id IS 'Link to the venues table for location details';
