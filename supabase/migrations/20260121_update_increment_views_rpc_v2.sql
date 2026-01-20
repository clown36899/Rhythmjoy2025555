-- Update increment_board_post_views RPC to use board_post_views table
DROP FUNCTION IF EXISTS increment_board_post_views(bigint);
DROP FUNCTION IF EXISTS increment_board_post_views(bigint, uuid, text, text);

CREATE OR REPLACE FUNCTION increment_board_post_views(
  p_post_id BIGINT,
  p_user_id UUID DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  -- Try to insert view record (will fail if already exists due to unique constraint)
  BEGIN
    INSERT INTO board_post_views (post_id, user_id, fingerprint)
    VALUES (p_post_id, p_user_id, p_fingerprint);
    
    v_inserted := TRUE;
  EXCEPTION
    WHEN unique_violation THEN
      -- View already exists, don't increment
      v_inserted := FALSE;
  END;

  -- If new view was inserted, increment the counter
  IF v_inserted THEN
    UPDATE board_posts
    SET views = COALESCE(views, 0) + 1
    WHERE id = p_post_id;
  END IF;

  RETURN v_inserted;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION increment_board_post_views(BIGINT, UUID, TEXT) TO public;
GRANT EXECUTE ON FUNCTION increment_board_post_views(BIGINT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_board_post_views(BIGINT, UUID, TEXT) TO authenticated;
