-- Drop the self-referential foreign key on learning_resources
ALTER TABLE public.learning_resources 
DROP CONSTRAINT IF EXISTS learning_resources_category_id_fkey;

ALTER TABLE public.learning_resources 
DROP CONSTRAINT IF EXISTS learning_resources_category_id_order_index_key;

ALTER TABLE public.learning_resources 
DROP CONSTRAINT IF EXISTS learning_resources_category_id_order_index_unique;
