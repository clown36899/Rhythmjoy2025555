-- Update blind threshold from 10 to 20 dislikes
-- Created: 2025-12-25

CREATE OR REPLACE FUNCTION public.check_post_dislikes()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id) >= 20 THEN
        UPDATE public.board_posts SET is_hidden = true WHERE id = NEW.post_id;
    END IF;
    -- Also update the dislikes count in board_posts
    UPDATE public.board_posts 
    SET dislikes = (SELECT count(*) FROM public.board_post_dislikes WHERE post_id = NEW.post_id)
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
