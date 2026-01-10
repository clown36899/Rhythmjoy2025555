-- Add parent_node_id to history_nodes for Sub-Flow (Container) support
ALTER TABLE history_nodes
ADD COLUMN parent_node_id BIGINT REFERENCES history_nodes(id) ON DELETE SET NULL;

-- Index for performance on lookups
CREATE INDEX idx_history_nodes_parent_id ON history_nodes(parent_node_id);
