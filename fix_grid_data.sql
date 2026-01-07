-- Manual fix for grid positioning data
-- This script populates grid_row and grid_column for existing data

-- First, let's set default values for items with null order_index
UPDATE learning_resources 
SET order_index = (ROW_NUMBER() OVER (ORDER BY created_at)) * 100
WHERE order_index IS NULL;

-- Now update grid positions for root-level items
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4)::INTEGER,
    grid_column = ((COALESCE(order_index, 0) / 100) % 4)::INTEGER
WHERE category_id IS NULL AND is_unclassified = FALSE;

-- For items in folders
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4)::INTEGER,
    grid_column = ((COALESCE(order_index, 0) / 100) % 4)::INTEGER
WHERE category_id IS NOT NULL;

-- For unclassified items
UPDATE learning_resources 
SET 
    grid_row = FLOOR((COALESCE(order_index, 0) / 100) / 4)::INTEGER,
    grid_column = ((COALESCE(order_index, 0) / 100) % 4)::INTEGER
WHERE is_unclassified = TRUE;

-- Verify the update
SELECT id, title, type, order_index, grid_row, grid_column, category_id, is_unclassified 
FROM learning_resources 
WHERE category_id IS NULL AND is_unclassified = FALSE
ORDER BY grid_row, grid_column
LIMIT 10;
