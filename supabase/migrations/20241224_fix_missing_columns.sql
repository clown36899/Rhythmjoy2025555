-- Add missing columns to board_posts
ALTER TABLE public.board_posts 
ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS dislikes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Ensure anonymous category exists and adjust orders
UPDATE public.board_categories SET display_order = display_order + 1 WHERE display_order >= 2 AND code != 'anonymous';
INSERT INTO public.board_categories (name, code, display_order, is_active)
VALUES ('익명게시판', 'anonymous', 2, true)
ON CONFLICT (code) DO UPDATE 
SET name = '익명게시판', display_order = 2, is_active = true;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
