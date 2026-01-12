-- ==========================================
-- Add description column to learning_categories
-- ==========================================
-- "Description" is a primary user-editable field, so it should be a first-class column,
-- not hidden inside a JSONB metadata blob.
-- ==========================================

-- 1. Add the column safely
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Migrate existing data from metadata (if any)
UPDATE learning_categories 
SET description = metadata->>'description'
WHERE description IS NULL 
AND metadata->>'description' IS NOT NULL;

-- 3. (Optional) Remove description from metadata to avoid duplication
-- UPDATE learning_categories
-- SET metadata = metadata - 'description'
-- WHERE metadata ? 'description';
