-- Ensure image columns exist for board_posts
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS image_thumbnail text;
