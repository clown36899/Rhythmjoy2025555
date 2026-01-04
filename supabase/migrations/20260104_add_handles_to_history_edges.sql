-- Migration: Add source_handle and target_handle to history_edges
-- This allows React Flow to remember which specific handles (top, bottom, left, right) were connected.

ALTER TABLE history_edges ADD COLUMN IF NOT EXISTS source_handle TEXT;
ALTER TABLE history_edges ADD COLUMN IF NOT EXISTS target_handle TEXT;

-- Drop existing unique constraint that only considered node IDs
ALTER TABLE history_edges DROP CONSTRAINT IF EXISTS history_edges_source_id_target_id_key;

-- Add new unique constraint including handles to allow multiple connections between same nodes in different directions
ALTER TABLE history_edges ADD CONSTRAINT history_edges_source_target_handle_key UNIQUE(source_id, target_id, source_handle, target_handle);

-- Update comments
COMMENT ON COLUMN history_edges.source_handle IS 'ID of the specific handle on the source node (e.g., left, right, top, bottom)';
COMMENT ON COLUMN history_edges.target_handle IS 'ID of the specific handle on the target node (e.g., left, right, top, bottom)';
