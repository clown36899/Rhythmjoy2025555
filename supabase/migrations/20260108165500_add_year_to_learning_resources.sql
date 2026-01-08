-- Add year column to learning_resources if it doesn't exist
ALTER TABLE learning_resources 
ADD COLUMN IF NOT EXISTS year INTEGER;

-- Optional: Add index for filtering by year
CREATE INDEX IF NOT EXISTS idx_learning_resources_year ON learning_resources(year);
