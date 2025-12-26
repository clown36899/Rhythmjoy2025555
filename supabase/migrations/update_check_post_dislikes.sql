-- Update check_post_dislikes trigger logic
-- Exclude 'free' category from auto-hiding
-- Created: 2025-12-26

CREATE OR REPLACE FUNCTION public.check_post_dislikes()
RETURNS TRIGGER AS $$
DECLARE
    post_category text;
BEGIN
    -- Get the category of the post being disliked
    SELECT category INTO post_category FROM public.board_posts WHERE id = NEW.post_id;

    -- Only auto-hide if dislikes >= 20 AND category is NOT 'free'
    -- Note: Anonymous board has its own separate logic in board_anonymous_posts table
    IF (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id) >= 20 THEN
        IF post_category IS DISTINCT FROM 'free' THEN
            UPDATE public.board_posts SET is_hidden = true WHERE id = NEW.post_id;
        END IF;
    END IF;

    -- Always update the dislikes count in board_posts
    UPDATE public.board_posts 
    SET dislikes = (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id)
    WHERE id = NEW.post_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
