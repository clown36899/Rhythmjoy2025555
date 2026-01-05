-- Add image_url column to learning_documents for person photos
ALTER TABLE public.learning_documents 
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.learning_documents.image_url IS 'URL to person photo or document image';
