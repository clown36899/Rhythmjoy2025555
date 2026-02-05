-- Add genre column to board_posts
ALTER TABLE public.board_posts
ADD COLUMN IF NOT EXISTS genre text;

COMMENT ON COLUMN public.board_posts.genre IS 'Genre/Tag for push notification filtering (e.g. Lindy Hop, Solo Jazz)';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
