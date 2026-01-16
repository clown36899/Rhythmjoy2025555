-- Migrate legacy 'general' type resources to 'learning_categories'
-- This preserves the ID so that any child resources pointing to this category_id remain valid.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Loop through all legacy folders in learning_resources
    FOR r IN SELECT * FROM learning_resources WHERE type IN ('general', 'folder', 'CATEGORY')
    LOOP
        RAISE NOTICE 'Migrating Legacy Folder: % (ID: %)', r.title, r.id;

        -- 1. Insert into learning_categories
        INSERT INTO learning_categories (id, name, created_at, updated_at, is_unclassified)
        VALUES (
            r.id, 
            r.title, 
            r.created_at, 
            r.updated_at,
            (CASE WHEN r.is_unclassified IS TRUE THEN TRUE ELSE FALSE END)
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = EXCLUDED.updated_at;

        -- 2. Delete from learning_resources (it is now a proper category)
        DELETE FROM learning_resources WHERE id = r.id;
        
    END LOOP;
END $$;
