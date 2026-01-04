-- Add mobile-specific position columns to history_nodes table
ALTER TABLE public.history_nodes 
ADD COLUMN IF NOT EXISTS mobile_x FLOAT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mobile_y FLOAT DEFAULT NULL;

COMMENT ON COLUMN public.history_nodes.mobile_x IS 'X coordinate for ReactFlow canvas on mobile devices';
COMMENT ON COLUMN public.history_nodes.mobile_y IS 'Y coordinate for ReactFlow canvas on mobile devices';
