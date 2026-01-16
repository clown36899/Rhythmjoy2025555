-- Drop potential unique constraint on (category_id, order_index) that causes 409 conflicts
ALTER TABLE learning_resources DROP CONSTRAINT IF EXISTS learning_resources_category_id_order_index_key;
ALTER TABLE learning_resources DROP CONSTRAINT IF EXISTS learning_resources_category_id_order_index_unique;
