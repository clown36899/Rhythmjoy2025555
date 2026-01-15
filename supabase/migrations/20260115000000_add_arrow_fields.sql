-- Add arrow-specific fields to history_nodes table
-- Migration: Add arrow support to history timeline

ALTER TABLE history_nodes
ADD COLUMN IF NOT EXISTS arrow_rotation INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS arrow_length INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS arrow_text TEXT;

-- Add comments for documentation
COMMENT ON COLUMN history_nodes.arrow_rotation IS 'Arrow rotation angle in degrees (0-360)';
COMMENT ON COLUMN history_nodes.arrow_length IS 'Arrow length in pixels (100-500)';
COMMENT ON COLUMN history_nodes.arrow_text IS 'Text to display on the arrow';
