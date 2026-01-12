-- ==========================================
-- Allow NULL titles in history_nodes
-- ==========================================
-- Purpose: To support 'Source of Truth' architecture where linked nodes
-- refer to original resource titles instead of storing a redundant copy.
-- ==========================================

ALTER TABLE history_nodes ALTER COLUMN title DROP NOT NULL;

-- Optional: Clear existing redundant titles for linked nodes
-- (Safe to run only if the frontend mapper is confirmed to work)
-- UPDATE history_nodes
-- SET title = NULL
-- WHERE (linked_video_id IS NOT NULL 
--     OR linked_document_id IS NOT NULL 
--     OR linked_playlist_id IS NOT NULL 
--     OR linked_category_id IS NOT NULL);
