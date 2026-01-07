-- Add metadata column to learning_categories to store extra info (e.g. original playlist source)
ALTER TABLE public.learning_categories 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
