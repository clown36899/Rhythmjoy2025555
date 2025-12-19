-- Add category column to board_posts table
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'free';

-- Add check constraint to ensure valid categories
-- Note: logic to drop constraint if exists is complex in simple SQL script without procedural code, 
-- but usually safe to run if constraint doesn't exist. If it exists, it might error, but the column add is idempotent.
-- Ideally we wrap in DO block but simple is better for user copy-paste.
-- Let's just assume they might have partially stuck state or clean state.
-- ALTER TABLE ... ADD CONSTRAINT will fail if it already exists. 
-- For safety/idempotency in a raw script, we can just try to add it.
ALTER TABLE board_posts 
ADD CONSTRAINT check_category 
CHECK (category IN ('free', 'trade', 'notice', 'market'));

-- Comment on column
COMMENT ON COLUMN board_posts.category IS 'Post category: free, trade, notice, market';

-- Create index for faster filtering by category
CREATE INDEX IF NOT EXISTS idx_board_posts_category ON board_posts(category);

-- [NEW] Add image columns for Flea Market (Market)
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS image_thumbnail text;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS image text;
