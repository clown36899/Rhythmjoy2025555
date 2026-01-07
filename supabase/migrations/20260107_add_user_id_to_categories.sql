-- Add user_id column to learning_categories
ALTER TABLE public.learning_categories 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Set default user_id for existing categories (adjust as needed)
-- You may want to set this to a specific admin user ID
UPDATE public.learning_categories 
SET user_id = '00000000-0000-0000-0000-000000000000'::uuid 
WHERE user_id IS NULL;

-- Make user_id NOT NULL after setting defaults
ALTER TABLE public.learning_categories 
ALTER COLUMN user_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_learning_categories_user_id ON public.learning_categories(user_id);
