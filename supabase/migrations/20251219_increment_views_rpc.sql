-- Function to safely increment view count
-- Corrected version: Uses BIGINT for ID because actual IDs are integers (e.g. '8')

DROP FUNCTION IF EXISTS increment_board_post_views(uuid); -- Drop old UUID version to avoid confusion

CREATE OR REPLACE FUNCTION increment_board_post_views(p_post_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
