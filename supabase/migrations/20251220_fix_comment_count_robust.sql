-- Robust fix for comment count: Handles NULLs, Permissions, and Forces Recalculation

-- 1. Redefine the trigger function with Safety First approach
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Use COALESCE to handle NULLs (NULL + 1 = NULL, which is bad)
        UPDATE board_posts
        SET comment_count = COALESCE(comment_count, 0) + 1
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Prevent negative counts with GREATEST
        UPDATE board_posts
        SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. FORCE RECALCULATE (The "Reset" Button)
-- This will fix any posts that currently show 0 but actually have comments
UPDATE board_posts
SET comment_count = (
    SELECT COUNT(*)
    FROM board_comments
    WHERE board_comments.post_id = board_posts.id
);

-- 3. Reload Schema to ensure API sees the changes
NOTIFY pgrst, 'reload schema';
