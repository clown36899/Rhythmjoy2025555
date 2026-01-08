-- Make title nullable in history_nodes
-- Linked nodes get their title from learning_resources, so they don't store it in history_nodes
ALTER TABLE history_nodes 
ALTER COLUMN title DROP NOT NULL;
