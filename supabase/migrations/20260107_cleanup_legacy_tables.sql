-- 🚨 WARNING: DATA DELETION SCRIPT 🚨
-- This script drops legacy tables that have been unified into 'learning_resources'.
-- Ensure 'learning_resources' contains all necessary data before running.

-- Note on Foreign Keys (e.g., Bookmarks):
-- If tables like 'learning_video_bookmarks' reference these tables, 
-- using CASCADE will DELETE those bookmarks as well.
-- If you wish to keep bookmarks, you must first ALTER the bookmark table 
-- to reference 'learning_resources(id)' instead.
-- Since IDs were preserved during migration, repointing constraints is safe.

-- Example Repointing (Uncomment and adjust constraint names if you want to save bookmarks):
/*
ALTER TABLE public.learning_video_bookmarks 
DROP CONSTRAINT learning_video_bookmarks_video_id_fkey; -- Check actual constraint name

ALTER TABLE public.learning_video_bookmarks
ADD CONSTRAINT learning_video_bookmarks_video_id_fkey
FOREIGN KEY (video_id) REFERENCES public.learning_resources(id) ON DELETE CASCADE;
*/

-- Drop Legacy Tables
DROP TABLE IF EXISTS public.learning_documents CASCADE;
DROP TABLE IF EXISTS public.learning_videos CASCADE;
DROP TABLE IF EXISTS public.learning_playlists CASCADE;
DROP TABLE IF EXISTS public.learning_categories CASCADE;
