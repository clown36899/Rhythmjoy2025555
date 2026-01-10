-- Add width and height columns to history_nodes for persisting folder/container dimensions
ALTER TABLE history_nodes
ADD COLUMN width FLOAT,
ADD COLUMN height FLOAT;

-- Optional: Add comments
COMMENT ON COLUMN history_nodes.width IS 'Custom width of the node for container layout';
COMMENT ON COLUMN history_nodes.height IS 'Custom height of the node for container layout';
