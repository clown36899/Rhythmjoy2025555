-- Consolidate social tables: Remove place_id and add place_name directly
-- Run this in Supabase SQL Editor

-- 1. Add new columns for place information
ALTER TABLE social_schedules 
ADD COLUMN IF NOT EXISTS place_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS category VARCHAR(50); -- 'club' or 'swing-bar' etc

-- 2. Remove the foreign key constraint
ALTER TABLE social_schedules 
DROP CONSTRAINT IF EXISTS social_schedules_place_id_fkey;

-- 3. Make place_id nullable (we'll remove it later after migration)
ALTER TABLE social_schedules 
ALTER COLUMN place_id DROP NOT NULL;

-- 4. Drop the index on place_id
DROP INDEX IF EXISTS idx_social_schedules_place_id;

-- Note: After running this, you should:
-- 1. Update your application code to use place_name instead of place_id
-- 2. Migrate any existing data from social_places to social_schedules
-- 3. Then drop the place_id column: ALTER TABLE social_schedules DROP COLUMN place_id;
-- 4. Drop the social_places table: DROP TABLE social_places;
