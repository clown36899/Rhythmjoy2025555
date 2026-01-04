-- Add foreign key columns to history_nodes to link with learning resources
ALTER TABLE public.history_nodes
ADD COLUMN IF NOT EXISTS linked_playlist_id UUID REFERENCES public.learning_playlists(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS linked_document_id UUID REFERENCES public.learning_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.history_nodes.linked_playlist_id IS 'Link to the source learning playlist';
COMMENT ON COLUMN public.history_nodes.linked_document_id IS 'Link to the source learning document';
