-- learning_videos 테이블에 개별 비디오 및 타임라인 지원을 위한 컬럼 추가

ALTER TABLE learning_videos
ADD COLUMN IF NOT EXISTS year INTEGER,
ADD COLUMN IF NOT EXISTS is_on_timeline BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES learning_categories(id),
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 기존 재생목록 비디오와의 호환성을 위해 playlist_id는 NULL 허용 (이미 허용되어 있을 수 있음)
ALTER TABLE learning_videos
ALTER COLUMN playlist_id DROP NOT NULL;

-- 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_learning_videos_playlist_id ON learning_videos(playlist_id);
CREATE INDEX IF NOT EXISTS idx_learning_videos_is_on_timeline ON learning_videos(is_on_timeline);
