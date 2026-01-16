-- Add is_unclassified column to learning_categories to support Unclassified Folders
ALTER TABLE learning_categories 
ADD COLUMN IF NOT EXISTS is_unclassified BOOLEAN DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_learning_categories_unclassified ON learning_categories(is_unclassified);
