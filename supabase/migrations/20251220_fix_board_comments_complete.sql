-- Comprehensive fix for Board Comments Foreign Key and Schema Cache

DO $$
BEGIN
    -- 1. Ensure the Foreign Key exists
    -- We first check if the constraint exists to avoid errors
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_board_comments_post'
    ) THEN
        -- Add the FK constraint
        ALTER TABLE board_comments
        ADD CONSTRAINT fk_board_comments_post
        FOREIGN KEY (post_id)
        REFERENCES board_posts(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Force a schema cache reload for PostgREST
-- This ensures Supabase API picks up the new relationship immediately
NOTIFY pgrst, 'reload schema';
