
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('learning_resources', 'learning_categories')
AND column_name IN ('created_by', 'user_id');
