-- Add Foreign Key constraint to board_comments table
-- This enables Supabase to detect the relationship between board_comments and board_posts
-- allowing queries like .select('*, board_comments(count)') to work.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_board_comments_post'
    ) THEN
        ALTER TABLE board_comments
        ADD CONSTRAINT fk_board_comments_post
        FOREIGN KEY (post_id)
        REFERENCES board_posts(id)
        ON DELETE CASCADE;
    END IF;
END $$;
