-- Fix linked_category_id relationship to point to learning_resources (Source of Truth)
-- Previous migration might have pointed it to learning_categories incorrectly or this is a fresh add.

-- 1. Drop existing constraint if it exists (from previous incorrect migration)
DO $$ 
BEGIN
    ALTER TABLE public.history_nodes 
    DROP CONSTRAINT IF EXISTS history_nodes_linked_category_id_fkey;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Add/Ensure column exists
ALTER TABLE public.history_nodes 
ADD COLUMN IF NOT EXISTS linked_category_id uuid;

-- 3. Add Correct Constraint referencing learning_resources
ALTER TABLE public.history_nodes 
ADD CONSTRAINT history_nodes_linked_category_id_fkey 
FOREIGN KEY (linked_category_id) 
REFERENCES public.learning_resources(id) 
ON DELETE SET NULL;

COMMENT ON COLUMN public.history_nodes.linked_category_id IS 'Link to a learning_resources item of type category/folder';
