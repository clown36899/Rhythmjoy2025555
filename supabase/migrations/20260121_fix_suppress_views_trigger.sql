-- Fix for suppress_views_realtime trigger
-- This trigger should suppress realtime broadcasts when ONLY views change,
-- but MUST still allow the database update to proceed.

-- Drop the broken trigger first
DROP TRIGGER IF EXISTS suppress_views_realtime ON board_posts;

-- Recreate the trigger function with correct logic
CREATE OR REPLACE FUNCTION suppress_views_realtime()
RETURNS TRIGGER AS $$
BEGIN
  -- CRITICAL: Always return NEW to allow the update to proceed
  -- The suppression happens via Supabase's realtime filtering, not by blocking the update
  
  -- Check if ONLY the views column changed (all other columns are identical)
  IF (OLD.views IS DISTINCT FROM NEW.views) AND
     (OLD.id IS NOT DISTINCT FROM NEW.id) AND
     (OLD.title IS NOT DISTINCT FROM NEW.title) AND
     (OLD.content IS NOT DISTINCT FROM NEW.content) AND
     (OLD.author_name IS NOT DISTINCT FROM NEW.author_name) AND
     (OLD.user_id IS NOT DISTINCT FROM NEW.user_id) AND
     (OLD.author_nickname IS NOT DISTINCT FROM NEW.author_nickname) AND
     (OLD.created_at IS NOT DISTINCT FROM NEW.created_at) AND
     (OLD.updated_at IS NOT DISTINCT FROM NEW.updated_at) AND
     (OLD.prefix_id IS NOT DISTINCT FROM NEW.prefix_id) AND
     (OLD.is_notice IS NOT DISTINCT FROM NEW.is_notice) AND
     (OLD.category IS NOT DISTINCT FROM NEW.category) AND
     (OLD.image_thumbnail IS NOT DISTINCT FROM NEW.image_thumbnail) AND
     (OLD.image IS NOT DISTINCT FROM NEW.image) AND
     (OLD.is_hidden IS NOT DISTINCT FROM NEW.is_hidden) AND
     (OLD.comment_count IS NOT DISTINCT FROM NEW.comment_count) AND
     (OLD.likes IS NOT DISTINCT FROM NEW.likes) AND
     (OLD.dislikes IS NOT DISTINCT FROM NEW.dislikes) AND
     (OLD.display_order IS NOT DISTINCT FROM NEW.display_order) AND
     (OLD.favorites IS NOT DISTINCT FROM NEW.favorites)
  THEN
    -- Only views changed - we want to suppress realtime broadcast
    -- But we MUST still return NEW to allow the DB update
    -- Supabase realtime can be configured to ignore these updates via filters
    NULL; -- This is just a marker, doesn't affect the return
  END IF;
  
  -- ALWAYS return NEW to allow the update to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER suppress_views_realtime
  BEFORE UPDATE ON board_posts
  FOR EACH ROW
  EXECUTE FUNCTION suppress_views_realtime();

-- Note: To fully suppress realtime broadcasts for views-only updates,
-- you need to configure Supabase Realtime filters on the client side:
-- supabase.channel('board_posts').on('postgres_changes', {
--   event: 'UPDATE',
--   schema: 'public',
--   table: 'board_posts',
--   filter: 'views=neq.old.views'  -- This would need custom logic
-- })
