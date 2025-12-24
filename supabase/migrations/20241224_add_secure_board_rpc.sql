-- RPC for anonymous post management
CREATE OR REPLACE FUNCTION public.verify_post_password(p_post_id bigint, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.board_posts 
        WHERE id = p_post_id AND password = p_password
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_post_with_password(p_post_id bigint, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.board_posts WHERE id = p_post_id AND password = p_password) THEN
        -- Manually delete dependencies to prevent Foreign Key errors
        DELETE FROM public.board_comments WHERE post_id = p_post_id;
        DELETE FROM public.board_post_likes WHERE post_id = p_post_id;
        DELETE FROM public.board_post_dislikes WHERE post_id = p_post_id;
        
        -- Delete the post
        DELETE FROM public.board_posts WHERE id = p_post_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_post_with_password(
    p_post_id bigint, 
    p_password text,
    p_title text,
    p_content text,
    p_author_name text,
    p_image text,
    p_image_thumbnail text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.board_posts WHERE id = p_post_id AND password = p_password) THEN
        UPDATE public.board_posts 
        SET 
            title = p_title,
            content = p_content,
            author_name = p_author_name,
            author_nickname = p_author_name,
            image = COALESCE(p_image, image),
            image_thumbnail = COALESCE(p_image_thumbnail, image_thumbnail),
            updated_at = now()
        WHERE id = p_post_id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
