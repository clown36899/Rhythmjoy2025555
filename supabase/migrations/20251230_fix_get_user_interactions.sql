-- Fix get_user_interactions RPC function - v2
-- Remove explicit array type casting to let PostgreSQL infer types

DROP FUNCTION IF EXISTS get_user_interactions(uuid);

CREATE OR REPLACE FUNCTION get_user_interactions(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'post_likes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_likes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'post_dislikes', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_dislikes 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'post_favorites', COALESCE((
      SELECT json_agg(post_id) 
      FROM public.board_post_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'event_favorites', COALESCE((
      SELECT json_agg(event_id) 
      FROM public.event_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'social_group_favorites', COALESCE((
      SELECT json_agg(group_id) 
      FROM public.social_group_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'practice_room_favorites', COALESCE((
      SELECT json_agg(practice_room_id) 
      FROM public.practice_room_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json),
    'shop_favorites', COALESCE((
      SELECT json_agg(shop_id) 
      FROM public.shop_favorites 
      WHERE user_id = p_user_id
    ), '[]'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_interactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_interactions(uuid) TO anon;
