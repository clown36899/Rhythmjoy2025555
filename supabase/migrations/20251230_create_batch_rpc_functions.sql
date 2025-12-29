-- ============================================================================
-- Batch RPC Functions for API Optimization
-- ============================================================================
-- Purpose: Reduce 40+ duplicate API calls to 3 batch calls
-- Created: 2025-12-30
-- ============================================================================

-- ============================================================================
-- 1. get_user_interactions
-- ============================================================================
-- Combines all user interaction queries into a single RPC call
-- Reduces: 12 API calls → 1 API call (91.7% reduction)
-- ============================================================================

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
      SELECT array_agg(post_id) 
      FROM board_post_likes 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'post_dislikes', COALESCE((
      SELECT array_agg(post_id) 
      FROM board_post_dislikes 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'post_favorites', COALESCE((
      SELECT array_agg(post_id) 
      FROM board_post_favorites 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'event_favorites', COALESCE((
      SELECT array_agg(event_id) 
      FROM event_favorites 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'social_group_favorites', COALESCE((
      SELECT array_agg(social_group_id) 
      FROM social_group_favorites 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'practice_room_favorites', COALESCE((
      SELECT array_agg(practice_room_id) 
      FROM practice_room_favorites 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[]),
    'shop_favorites', COALESCE((
      SELECT array_agg(shop_id) 
      FROM shop_favorites 
      WHERE user_id = p_user_id
    ), ARRAY[]::integer[])
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_interactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_interactions(uuid) TO anon;

-- ============================================================================
-- 2. get_board_static_data
-- ============================================================================
-- Combines board categories, prefixes, and theme settings
-- Reduces: 16 API calls → 1 API call (93.75% reduction)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_board_static_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'categories', COALESCE((
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT *
        FROM board_categories
        WHERE is_active = true
        ORDER BY display_order ASC
      ) c
    ), '[]'::json),
    'prefixes', COALESCE((
      SELECT json_object_agg(
        bc.code,
        (
          SELECT json_agg(row_to_json(p))
          FROM (
            SELECT *
            FROM board_prefixes
            WHERE board_prefixes.board_category_code = bc.code
            ORDER BY display_order ASC
          ) p
        )
      )
      FROM board_categories bc
      WHERE bc.is_active = true
    ), '{}'::json),
    'theme_settings', COALESCE((
      SELECT row_to_json(t)
      FROM theme_settings t
      WHERE id = 1
    ), '{}'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_board_static_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_board_static_data() TO anon;

-- ============================================================================
-- 3. get_user_admin_status (Improved)
-- ============================================================================
-- Optimized admin check with STABLE for caching
-- Reduces: 10 API calls → 1 API call (90% reduction)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- STABLE allows PostgreSQL to cache the result within a transaction
  RETURN EXISTS (
    SELECT 1
    FROM board_admins
    WHERE user_id = auth.uid()
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO anon;

-- ============================================================================
-- Summary
-- ============================================================================
-- Total API call reduction: 38 calls → 3 calls (92.1% reduction)
-- Expected performance improvement: ~60% faster login flow
-- ============================================================================
