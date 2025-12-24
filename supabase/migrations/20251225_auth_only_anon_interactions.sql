-- 1. Modify tables to use user_id instead of fingerprint
-- Likes table
ALTER TABLE public.board_anonymous_likes 
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Dislikes table
ALTER TABLE public.board_anonymous_dislikes 
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Make fingerprint nullable since we rely on user_id now
ALTER TABLE public.board_anonymous_likes ALTER COLUMN fingerprint DROP NOT NULL;
ALTER TABLE public.board_anonymous_dislikes ALTER COLUMN fingerprint DROP NOT NULL;

-- 2. Drop old constraints and add new ones
ALTER TABLE public.board_anonymous_likes DROP CONSTRAINT IF EXISTS board_anonymous_likes_post_id_fingerprint_key;
ALTER TABLE public.board_anonymous_dislikes DROP CONSTRAINT IF EXISTS board_anonymous_dislikes_post_id_fingerprint_key;

CREATE UNIQUE INDEX IF NOT EXISTS board_anonymous_likes_user_key ON public.board_anonymous_likes(post_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS board_anonymous_dislikes_user_key ON public.board_anonymous_dislikes(post_id, user_id);

-- 3. Update RLS Policies
-- Likes
DROP POLICY IF EXISTS "Anonymous likes are viewable by everyone" ON public.board_anonymous_likes;
CREATE POLICY "Anonymous likes are viewable by everyone" ON public.board_anonymous_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert anonymous likes" ON public.board_anonymous_likes;
DROP POLICY IF EXISTS "Authenticated users can insert anonymous likes" ON public.board_anonymous_likes;
CREATE POLICY "Authenticated users can insert anonymous likes" ON public.board_anonymous_likes 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own likes" ON public.board_anonymous_likes;
CREATE POLICY "Users can delete their own likes" ON public.board_anonymous_likes 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- Dislikes
DROP POLICY IF EXISTS "Anonymous dislikes are viewable by everyone" ON public.board_anonymous_dislikes;
CREATE POLICY "Anonymous dislikes are viewable by everyone" ON public.board_anonymous_dislikes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert anonymous dislikes" ON public.board_anonymous_dislikes;
DROP POLICY IF EXISTS "Authenticated users can insert anonymous dislikes" ON public.board_anonymous_dislikes;
CREATE POLICY "Authenticated users can insert anonymous dislikes" ON public.board_anonymous_dislikes 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own dislikes" ON public.board_anonymous_dislikes;
CREATE POLICY "Users can delete their own dislikes" ON public.board_anonymous_dislikes 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 4. Update RPC to use user_id
CREATE OR REPLACE FUNCTION public.toggle_anonymous_interaction(
    p_post_id bigint,
    p_user_id uuid, -- Changed from fingerprint text
    p_type text -- 'like' or 'dislike'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table text;
    v_opposite_table text;
    v_exists boolean;
    v_result jsonb;
BEGIN
    IF p_type = 'like' THEN
        v_table := 'board_anonymous_likes';
        v_opposite_table := 'board_anonymous_dislikes';
    ELSIF p_type = 'dislike' THEN
        v_table := 'board_anonymous_dislikes';
        v_opposite_table := 'board_anonymous_likes';
    ELSE
        RAISE EXCEPTION 'Invalid interaction type. Use ''like'' or ''dislike''.';
    END IF;

    -- Check if current interaction exists
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE post_id = $1 AND user_id = $2)', v_table)
    INTO v_exists
    USING p_post_id, p_user_id;

    IF v_exists THEN
        -- Toggle OFF: Remove current
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND user_id = $2', v_table)
        USING p_post_id, p_user_id;
        v_result := jsonb_build_object('status', 'removed', 'type', p_type);
    ELSE
        -- Toggle ON: Insert current and remove opposite
        EXECUTE format('DELETE FROM public.%I WHERE post_id = $1 AND user_id = $2', v_opposite_table)
        USING p_post_id, p_user_id;
        
        EXECUTE format('INSERT INTO public.%I (post_id, user_id) VALUES ($1, $2)', v_table)
        USING p_post_id, p_user_id;
        v_result := jsonb_build_object('status', 'added', 'type', p_type);
    END IF;

    RETURN v_result;
END;
$$;

-- 5. Update Triggers for sync
CREATE OR REPLACE FUNCTION public.handle_anonymous_mutual_like()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.board_anonymous_dislikes 
    WHERE post_id = NEW.post_id AND user_id = NEW.user_id; 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_anonymous_mutual_dislike()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.board_anonymous_likes 
    WHERE post_id = NEW.post_id AND user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_anonymous_mutual_like ON public.board_anonymous_likes;
CREATE TRIGGER tr_anonymous_mutual_like
BEFORE INSERT ON public.board_anonymous_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_anonymous_mutual_like();

DROP TRIGGER IF EXISTS tr_anonymous_mutual_dislike ON public.board_anonymous_dislikes;
CREATE TRIGGER tr_anonymous_mutual_dislike
BEFORE INSERT ON public.board_anonymous_dislikes
FOR EACH ROW EXECUTE FUNCTION public.handle_anonymous_mutual_dislike();
