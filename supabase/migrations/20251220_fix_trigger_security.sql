-- Fix permission issues with the comment count trigger
-- "SECURITY DEFINER" allows the function to run with the privileges of the creator (usually postgres/admin)
-- bypassing RLS policies that might prevent a user from updating another user's post count.

CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE board_posts
        SET comment_count = comment_count + 1
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE board_posts
        SET comment_count = comment_count - 1
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Force a re-calculation (backfill) just in case previous attempts were blocked
UPDATE board_posts
SET comment_count = (
    SELECT COUNT(*)
    FROM board_comments
    WHERE board_comments.post_id = board_posts.id
);

NOTIFY pgrst, 'reload schema';
