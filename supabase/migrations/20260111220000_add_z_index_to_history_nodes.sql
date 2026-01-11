-- Add z_index column to history_nodes for depth control
ALTER TABLE history_nodes ADD COLUMN IF NOT EXISTS z_index INTEGER DEFAULT 0;

-- Optional: Add index for performance if we frequently sort by z_index
CREATE INDEX IF NOT EXISTS idx_history_nodes_z_index ON history_nodes(z_index);
