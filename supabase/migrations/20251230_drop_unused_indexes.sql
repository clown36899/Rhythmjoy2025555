-- ============================================================================
-- Remove Unused Indexes
-- ============================================================================
-- Purpose: Remove 13 unused indexes (0% cache hit rate)
-- Expected Impact: ~200KB DB size reduction, improved write performance
-- Created: 2025-12-30
-- ============================================================================

-- Board Users Indexes (2개)
DROP INDEX IF EXISTS public.idx_board_users_nickname;
DROP INDEX IF EXISTS public.idx_board_users_phone_number;

-- Venues Constraints (1개) - UNIQUE constraint, not just index
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_name_category_key;

-- History Indexes (2개)
DROP INDEX IF EXISTS public.idx_history_nodes_category;
DROP INDEX IF EXISTS public.idx_history_nodes_created_by;

-- History Constraints (1개)
ALTER TABLE public.history_edges DROP CONSTRAINT IF EXISTS history_edges_source_id_target_id_key;

-- Board Anonymous Constraints (1개)
ALTER TABLE public.board_anonymous_likes DROP CONSTRAINT IF EXISTS board_anonymous_likes_user_key;

-- Billboard Indexes (2개)
DROP INDEX IF EXISTS public.idx_billboard_users_is_active;
DROP INDEX IF EXISTS public.idx_billboard_users_email;

-- Shop Favorites Indexes (1개)
DROP INDEX IF EXISTS public.idx_shop_favorites_shop_id;

-- Board Comments Indexes (1개)
DROP INDEX IF EXISTS public.idx_board_comments_user_id;

-- Crawl History Constraints (1개)
ALTER TABLE public.crawl_history DROP CONSTRAINT IF EXISTS crawl_history_url_key;

-- Board Banned Words Constraints (1개)
ALTER TABLE public.board_banned_words DROP CONSTRAINT IF EXISTS board_banned_words_word_key;

-- ============================================================================
-- Summary
-- ============================================================================
-- Total indexes removed: 13
-- Expected DB size reduction: ~200KB
-- Expected write performance improvement: 5-10%
-- ============================================================================
