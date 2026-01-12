-- ==========================================
-- Add 'year' column to learning_categories
-- ==========================================
-- Adds standard column: year (INTEGER)
-- ==========================================

-- 1. Add 'year' column
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS year INTEGER;

-- 2. Migrate existing data from metadata (if any)
-- Cast text/json value to integer safely
UPDATE learning_categories 
SET year = (metadata->>'year')::INTEGER
WHERE year IS NULL 
AND metadata->>'year' IS NOT NULL;
