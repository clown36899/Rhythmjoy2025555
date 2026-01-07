-- Add subtype to learning_documents to distinguish between 'document' and 'person'
ALTER TABLE public.learning_documents
ADD COLUMN IF NOT EXISTS subtype TEXT DEFAULT 'document';

COMMENT ON COLUMN public.learning_documents.subtype IS 'Explicit type: "document" or "person"';
