-- Create RPC function for secure anonymous comment deletion
-- Created: 2025-12-25

CREATE OR REPLACE FUNCTION public.delete_anonymous_comment_with_password(
    p_comment_id bigint,
    p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stored_password text;
    v_result json;
BEGIN
    -- Get the stored password for this comment
    SELECT password INTO v_stored_password
    FROM public.board_comments
    WHERE id = p_comment_id;

    -- Check if comment exists
    IF v_stored_password IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Comment not found'
        );
    END IF;

    -- Verify password
    IF v_stored_password != p_password THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Incorrect password'
        );
    END IF;

    -- Delete the comment
    DELETE FROM public.board_comments
    WHERE id = p_comment_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Comment deleted successfully'
    );
END;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.delete_anonymous_comment_with_password(bigint, text) TO anon, authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
