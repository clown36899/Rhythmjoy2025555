-- 1. Pre-flight Cleanup: Handle existing orphans
-- Ensure all category_id values point to valid categories BEFORE adding FK.
-- Any resource pointing to a non-existent category will be moved to Root (NULL).
UPDATE public.learning_resources
SET category_id = NULL
WHERE category_id IS NOT NULL
  AND category_id NOT IN (SELECT id FROM public.learning_categories);

-- 2. Add Foreign Key Constraint
-- Use ON DELETE SET NULL to ensure resources are not deleted when their folder is deleted.
ALTER TABLE public.learning_resources
ADD CONSTRAINT fk_learning_resources_category
FOREIGN KEY (category_id)
REFERENCES public.learning_categories(id)
ON DELETE SET NULL;
