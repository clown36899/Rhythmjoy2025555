-- Add user_id column to social_schedules table
-- This allows user-based authentication instead of password

ALTER TABLE social_schedules
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make password nullable for backward compatibility
ALTER TABLE social_schedules
ALTER COLUMN password DROP NOT NULL;

-- Add index for faster user_id lookups
CREATE INDEX idx_social_schedules_user_id ON social_schedules(user_id);

-- Add comment
COMMENT ON COLUMN social_schedules.user_id IS 'User who created this schedule. Used for edit permissions instead of password.';
