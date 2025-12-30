
-- ============================================================================
-- Update get_board_static_data RPC to include Billboard, Venues, and Shops
-- Purpose: Eliminate duplicate API calls on login/app load
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
    -- 1. Board Categories (Existing)
    'categories', COALESCE((
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT *
        FROM board_categories
        WHERE is_active = true
        ORDER BY display_order ASC
      ) c
    ), '[]'::json),

    -- 2. Board Prefixes (Existing)
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

    -- 3. Theme Settings (Existing)
    'theme_settings', COALESCE((
      SELECT row_to_json(t)
      FROM theme_settings t
      WHERE id = 1
    ), '{}'::json),

    -- 4. Billboard Settings (New)
    'billboard_settings', COALESCE((
       SELECT row_to_json(b)
       FROM billboard_settings b
       WHERE id = 1
    ), '{}'::json),

    -- 5. Practice Rooms (New - Lite version for Banner)
    'practice_rooms', COALESCE((
       SELECT json_agg(row_to_json(v))
       FROM (
          SELECT id, name, address, images, category, display_order, is_active
          FROM venues
          WHERE category = '연습실' AND is_active = true
          ORDER BY display_order ASC
       ) v
    ), '[]'::json),

     -- 6. Shops (New - Lite version for Banner)
    'shops', COALESCE((
       SELECT json_agg(row_to_json(s))
       FROM (
          SELECT 
            s.id, 
            s.name, 
            s.description, 
            s.logo_url, 
            s.website_url, 
            s.created_at,
            COALESCE((
              SELECT json_agg(fi)
              FROM featured_items fi
              WHERE fi.shop_id = s.id
            ), '[]'::json) as featured_items
          FROM shops s
          -- WHERE is_active = true -- Removed as column might not exist
          ORDER BY s.created_at DESC
       ) s
    ), '[]'::json),

    -- 7. Genre Weights (New)
    'genre_weights', COALESCE((
       SELECT value
       FROM app_settings
       WHERE key = 'genre_weights'
       LIMIT 1
    ), '{}'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission (Idempotent)
GRANT EXECUTE ON FUNCTION get_board_static_data() TO authenticated;
GRANT EXECUTE ON FUNCTION get_board_static_data() TO anon;
