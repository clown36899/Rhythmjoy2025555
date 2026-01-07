-- Fix foreign key constraint on legacy learning_videos table
-- This unblocks folder deletion in CategoryManager while it's still pointing to the old tables

DO $$ 
BEGIN
    -- 1. Fix learning_videos
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'learning_videos_category_id_fkey' 
        AND table_name = 'learning_videos'
    ) THEN
        ALTER TABLE public.learning_videos DROP CONSTRAINT learning_videos_category_id_fkey;
    END IF;

    ALTER TABLE public.learning_videos 
    ADD CONSTRAINT learning_videos_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES public.learning_categories(id) ON DELETE SET NULL;

    -- 2. Confirm learning_playlists has SET NULL (already seems to, but let's be sure)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'learning_playlists_category_id_fkey' 
        AND table_name = 'learning_playlists'
    ) THEN
        ALTER TABLE public.learning_playlists DROP CONSTRAINT learning_playlists_category_id_fkey;
    END IF;

    ALTER TABLE public.learning_playlists 
    ADD CONSTRAINT learning_playlists_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES public.learning_categories(id) ON DELETE SET NULL;

END $$;
