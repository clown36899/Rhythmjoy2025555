-- ==========================================
-- Restore learning_categories from history_nodes
-- ==========================================
-- 1. Insert missing categories based on orphaned history nodes
-- 2. Link history nodes to the newly created categories
-- 3. Clean up redundancy (Source of Truth)
-- ==========================================

DO $$
DECLARE
    r RECORD;
    new_cat_id UUID;
    v_user_id UUID;
BEGIN
    -- 0. Get a default user_id (optional, using the first user found or specific logic)
    -- In a real scenario, we should try to use the history_node's creator user_id
    -- For this script, we will loop through distinct (title, user_id) pairs
    
    RAISE NOTICE 'Starting Category Recovery...';

    FOR r IN 
        SELECT DISTINCT title, created_by, category, description, created_at
        FROM history_nodes
        WHERE category IN ('folder', 'canvas', 'general')
        AND linked_category_id IS NULL
        AND title IS NOT NULL
    LOOP
        -- 1. Create new category
        INSERT INTO learning_categories (name, metadata, user_id, created_at)
        VALUES (
            r.title, 
            jsonb_build_object(
                'description', r.description,
                'subtype', CASE WHEN r.category = 'canvas' THEN 'canvas' ELSE 'folder' END
            ),
            r.created_by,
            r.created_at
        )
        RETURNING id INTO new_cat_id;
        
        RAISE NOTICE 'Created Category: % (ID: %)', r.title, new_cat_id;

        -- 2. Update history_nodes to link to this new category
        -- Link ALL nodes that match this title and user (even if they weren't the exact row that triggered the loop)
        UPDATE history_nodes
        SET linked_category_id = new_cat_id
        WHERE title = r.title 
        AND (created_by = r.created_by OR (created_by IS NULL AND r.created_by IS NULL))
        AND category IN ('folder', 'canvas', 'general')
        AND linked_category_id IS NULL;

        -- 3. Source of Truth Cleanup
        -- Now that it is linked, we remove the title/description from history_nodes
        UPDATE history_nodes
        SET title = NULL, description = NULL
        WHERE linked_category_id = new_cat_id;
        
    END LOOP;

    RAISE NOTICE 'Category Recovery Completed.';
END $$;
