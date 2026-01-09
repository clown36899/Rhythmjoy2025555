-- Add scope column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'domestic';

-- Add comment
COMMENT ON COLUMN events.scope IS '행사 지역 범위 (domestic: 국내, overseas: 국외)';

-- Update existing rows to have default value (optional, handled by default)
-- UPDATE events SET scope = 'domestic' WHERE scope IS NULL;
