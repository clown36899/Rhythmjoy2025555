-- Fix: Re-create function with SECURITY DEFINER to bypass RLS for view counts
-- Issue: Previous version might have been applied without SECURITY DEFINER or RLS is blocking updates from anon

DROP FUNCTION IF EXISTS increment_board_post_views(bigint);

CREATE OR REPLACE FUNCTION increment_board_post_views(p_post_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Run as owner (postgres) to bypass RLS
AS $$
BEGIN
  UPDATE board_posts
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_post_id;
END;
$$;

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION increment_board_post_views(bigint) TO postgres;
GRANT EXECUTE ON FUNCTION increment_board_post_views(bigint) TO anon;
GRANT EXECUTE ON FUNCTION increment_board_post_views(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_board_post_views(bigint) TO service_role;
