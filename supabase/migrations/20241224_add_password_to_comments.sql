-- Add password column to board_comments for anonymous deletion
ALTER TABLE public.board_comments 
ADD COLUMN IF NOT EXISTS password text;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
