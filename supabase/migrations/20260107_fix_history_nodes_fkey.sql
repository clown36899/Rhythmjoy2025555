-- 1. Remove old constraints from history_nodes
ALTER TABLE public.history_nodes
DROP CONSTRAINT IF EXISTS history_nodes_linked_playlist_id_fkey,
DROP CONSTRAINT IF EXISTS history_nodes_linked_document_id_fkey,
DROP CONSTRAINT IF EXISTS history_nodes_linked_video_id_fkey,
DROP CONSTRAINT IF EXISTS history_nodes_linked_category_id_fkey;

-- 2. Add new constraints pointing to the unified learning_resources table
-- Note: We use the same column names but now they all reference learning_resources(id)
ALTER TABLE public.history_nodes
ADD CONSTRAINT history_nodes_linked_playlist_id_fkey 
    FOREIGN KEY (linked_playlist_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL,
ADD CONSTRAINT history_nodes_linked_document_id_fkey 
    FOREIGN KEY (linked_document_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL,
ADD CONSTRAINT history_nodes_linked_video_id_fkey 
    FOREIGN KEY (linked_video_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL,
ADD CONSTRAINT history_nodes_linked_category_id_fkey 
    FOREIGN KEY (linked_category_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL;

COMMENT ON TABLE public.history_nodes IS 'Unified: linked resource IDs now all reference learning_resources(id)';
