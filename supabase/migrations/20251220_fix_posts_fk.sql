-- Fix relationships broken by table recreation
-- The 'board_posts' table is still pointing to 'board_prefixes_backup'
-- We need to point it to the NEW 'board_prefixes' table

-- 1. Drop the old Foreign Key (referencing backup)
ALTER TABLE board_posts DROP CONSTRAINT IF EXISTS board_posts_prefix_id_fkey;

-- 2. Add new Foreign Key referencing the new table
ALTER TABLE board_posts
ADD CONSTRAINT board_posts_prefix_id_fkey
FOREIGN KEY (prefix_id)
REFERENCES board_prefixes(id)
ON DELETE SET NULL;

-- 3. Reload schema cache (notify Supabase)
NOTIFY pgrst, 'reload schema';
