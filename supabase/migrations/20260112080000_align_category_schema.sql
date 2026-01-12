-- ==========================================
-- Align learning_categories schema with learning_resources
-- ==========================================
-- Adds standard columns: description, content, image_url
-- ==========================================

-- 1. Add 'description' (Source/System Description)
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Add 'content' (User Editable Notes)
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS content TEXT;

-- 3. Add 'image_url' (Thumbnail)
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 4. Migrate existing data from metadata (if any)
-- Move metadata->>'description' into the new 'description' column
UPDATE learning_categories 
SET description = metadata->>'description'
WHERE description IS NULL 
AND metadata->>'description' IS NOT NULL;
