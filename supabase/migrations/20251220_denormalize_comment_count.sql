-- Denormalize comment_count for board_posts
-- This improves performance and reliability by storing the count directly on the post record

DO $$
BEGIN
    -- 1. Add comment_count column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'board_posts' 
        AND column_name = 'comment_count'
    ) THEN
        ALTER TABLE board_posts 
        ADD COLUMN comment_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Create or replace the function to update comment count
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
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

-- 3. Create triggers
DROP TRIGGER IF EXISTS trigger_update_comment_count_insert ON board_comments;
CREATE TRIGGER trigger_update_comment_count_insert
AFTER INSERT ON board_comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

DROP TRIGGER IF EXISTS trigger_update_comment_count_delete ON board_comments;
CREATE TRIGGER trigger_update_comment_count_delete
AFTER DELETE ON board_comments
FOR EACH ROW
EXECUTE FUNCTION update_post_comment_count();

-- 4. Initial Backfill: Calculate and set existing counts
-- This ensures the column starts with correct data
UPDATE board_posts
SET comment_count = (
    SELECT COUNT(*)
    FROM board_comments
    WHERE board_comments.post_id = board_posts.id
);

-- 5. Reload Schema
NOTIFY pgrst, 'reload schema';
