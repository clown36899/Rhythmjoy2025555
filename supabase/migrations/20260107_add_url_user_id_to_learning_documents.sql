-- 1. Learning Documents: Add url and user_id
ALTER TABLE public.learning_documents 
ADD COLUMN IF NOT EXISTS url TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learning_documents_user_id ON public.learning_documents(user_id);

-- 2. Learning Playlists: Add user_id
ALTER TABLE public.learning_playlists
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learning_playlists_user_id ON public.learning_playlists(user_id);

-- 3. Learning Videos: Add user_id
ALTER TABLE public.learning_videos
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learning_videos_user_id ON public.learning_videos(user_id);

-- Comments
COMMENT ON COLUMN public.learning_documents.url IS 'External URL reference for this document (non-YouTube links)';
COMMENT ON COLUMN public.learning_documents.user_id IS 'User who created this document (Standard System ID)';
COMMENT ON COLUMN public.learning_playlists.user_id IS 'User who created this playlist (Standard System ID)';
COMMENT ON COLUMN public.learning_videos.user_id IS 'User who created this video (Standard System ID)';
