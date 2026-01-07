-- 1. Create Unified Table: learning_resources
DROP TABLE IF EXISTS public.learning_resources CASCADE;

CREATE TABLE public.learning_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    category_id UUID, -- 제약 조건은 나중에 추가
    type TEXT NOT NULL CHECK (type IN ('video', 'document', 'person', 'general')),
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    image_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    order_index INTEGER DEFAULT 0
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_learning_resources_category_id ON public.learning_resources(category_id);
CREATE INDEX IF NOT EXISTS idx_learning_resources_type ON public.learning_resources(type);
CREATE INDEX IF NOT EXISTS idx_learning_resources_user_id ON public.learning_resources(user_id);

-- 2. Migrate Data: Categories (Folders)
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, created_at, updated_at
)
SELECT
    id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    parent_id as category_id,
    'general' as type,
    name as title,
    created_at,
    updated_at
FROM public.learning_categories
ON CONFLICT (id) DO NOTHING;

-- 3. Migrate Data: Documents & Persons
-- Maps 'subtype' field to 'type' column
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, description, url, image_url, created_at, updated_at
)
SELECT
    id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), -- Ensure user_id not null (adjust fallback if needed)
    NULL, -- category_id를 NULL로 설정 (기존 learning_categories 참조 제거)
    CASE 
        WHEN subtype = 'person' THEN 'person' 
        ELSE 'document' 
    END as type,
    title,
    content as description, -- Map content to description
    url,
    image_url,
    created_at,
    updated_at
FROM public.learning_documents
ON CONFLICT (id) DO NOTHING;

-- 4. Migrate Data: Videos
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, description, url, metadata, created_at, updated_at
)
SELECT
    id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NULL, -- category_id를 NULL로 설정
    'video',
    title,
    description,
    'https://www.youtube.com/watch?v=' || youtube_video_id as url, -- Construct URL
    jsonb_build_object(
        'youtube_video_id', youtube_video_id,
        'duration', duration_seconds, -- Fixed: duration -> duration_seconds
        -- Removed view_count (column missing)
        'playlist_id', playlist_id,
        'is_public', is_public
    ) as metadata,
    created_at,
    updated_at
FROM public.learning_videos
ON CONFLICT (id) DO NOTHING;

-- 5. Migrate Data: Playlists
INSERT INTO public.learning_resources (
    id, user_id, category_id, type, title, description, image_url, metadata, created_at, updated_at
)
SELECT
    id,
    COALESCE(author_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NULL,
    'general',
    title,
    description,
    thumbnail_url as image_url,
    jsonb_build_object(
        'category_name', category,
        'is_public', is_public,
        'tags', tags
    ) as metadata,
    created_at,
    updated_at
FROM public.learning_playlists
ON CONFLICT (id) DO NOTHING;

-- 6. Add foreign key constraint after migration
ALTER TABLE public.learning_resources 
ADD CONSTRAINT learning_resources_category_id_fkey 
FOREIGN KEY (category_id) REFERENCES public.learning_resources(id) ON DELETE CASCADE;

-- 7. Cleanup Instructions (Commented out for safety)
-- Verify data in 'learning_resources' before running these!
-- DROP TABLE public.learning_documents;
-- DROP TABLE public.learning_videos;
-- DROP TABLE public.learning_playlists;
