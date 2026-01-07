-- Add grid positioning columns to learning_resources
ALTER TABLE learning_resources 
ADD COLUMN IF NOT EXISTS grid_row INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_column INTEGER DEFAULT 0;

-- Migrate existing data: convert order_index to grid position
-- Assume 4 columns per row as default
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4),
    grid_column = (COALESCE(order_index, 0) / 100) % 4
WHERE category_id IS NULL AND is_unclassified = FALSE;

-- For items in folders, use simple sequential layout
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4),
    grid_column = (COALESCE(order_index, 0) / 100) % 4
WHERE category_id IS NOT NULL;

-- For unclassified items
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4),
    grid_column = (COALESCE(order_index, 0) / 100) % 4
WHERE is_unclassified = TRUE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_learning_resources_grid ON learning_resources(grid_row, grid_column);
