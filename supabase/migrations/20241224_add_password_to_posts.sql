-- Add password column to board_posts for anonymous deletion
ALTER TABLE public.board_posts 
ADD COLUMN IF NOT EXISTS password text;

-- Add index for security (though not strictly necessary for deletion check, good for future)
CREATE INDEX IF NOT EXISTS idx_board_posts_category ON public.board_posts(category);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
