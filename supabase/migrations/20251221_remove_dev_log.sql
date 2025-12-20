-- ==========================================
-- Remove Dev Log System
-- ==========================================

-- 1. Drop the App Versions Table
DROP TABLE IF EXISTS app_versions;

-- 2. Remove 'dev-log' category posts (Optional: Keep them or delete? Safe to delete based on user request)
DELETE FROM board_posts WHERE category = 'dev-log';

-- 3. Remove 'dev-log' from categories
DELETE FROM board_categories WHERE code = 'dev-log';

-- 4. Revert Check Constraint (Optional, but good for cleanup)
ALTER TABLE board_posts DROP CONSTRAINT IF EXISTS check_category;
ALTER TABLE board_posts ADD CONSTRAINT check_category 
  CHECK (category IN ('free', 'trade', 'notice', 'market'));
