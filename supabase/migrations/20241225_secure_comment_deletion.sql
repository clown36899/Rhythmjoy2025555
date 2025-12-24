-- Function to verify password and delete anonymous comment securely
-- Updated: 2025-12-25 - Fixed parameter type and table name
CREATE OR REPLACE FUNCTION public.delete_anonymous_comment_with_password(
  p_comment_id bigint,
  p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_deleted int;
BEGIN
  -- Delete the comment only if the ID and password match
  DELETE FROM board_anonymous_comments
  WHERE id = p_comment_id
  AND password = p_password;
  
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  
  -- Return true if a row was deleted, false otherwise
  RETURN v_rows_deleted > 0;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.delete_anonymous_comment_with_password(bigint, text) TO anon, authenticated;
