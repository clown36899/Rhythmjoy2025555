-- Make password nullable for backward compatibility (if not already)
DO $$ 
BEGIN
    ALTER TABLE social_schedules
    ALTER COLUMN password DROP NOT NULL;
EXCEPTION
    WHEN others THEN
        -- Column is already nullable, skip
        NULL;
END $$;

-- Add index for faster user_id lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_social_schedules_user_id ON social_schedules(user_id);

-- Add comment
COMMENT ON COLUMN social_schedules.user_id IS 'User who created this schedule. Used for edit permissions instead of password.';
