-- Final Robust Patch: Migrate BOTH playlists and categories to learning_resources
-- Based on ACTUAL structure verified via script

-- 1. Migrate Categories (Folders) first
-- ACTUAL learning_categories Columns: [id, name, parent_id, order_index, created_at, updated_at, metadata]
-- Note: user_id is missing from this table, so we use a fallback to satisfy learning_resources NOT NULL constraint.
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, metadata, created_at, updated_at
)
SELECT
    id,
    '00000000-0000-0000-0000-000000000000'::uuid as user_id, -- Fallback admin/system ID
    parent_id as category_id,
    'general' as type,
    name as title,
    COALESCE(metadata, '{}'::jsonb) as metadata,
    created_at,
    updated_at
FROM public.learning_categories
ON CONFLICT (id) DO NOTHING;

-- 2. Migrate Playlists
-- ACTUAL learning_playlists Columns: [id, title, description, thumbnail_url, category, tags, is_public, author_id, created_at, updated_at, youtube_playlist_id, category_id, year, is_on_timeline, user_id]
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, description, image_url, metadata, created_at, updated_at
)
SELECT
    id,
    COALESCE(user_id, author_id, '00000000-0000-0000-0000-000000000000'::uuid) as user_id,
    category_id,
    'general' as type,
    title,
    description,
    thumbnail_url as image_url,
    jsonb_build_object(
        'original_category', category,
        'is_public', is_public,
        'tags', tags,
        'youtube_playlist_id', youtube_playlist_id,
        'year', year,
        'is_on_timeline', is_on_timeline
    ) as metadata,
    created_at,
    updated_at
FROM public.learning_playlists
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.learning_resources IS 'Unified: Verified migration from categories and playlists using real schema.';
