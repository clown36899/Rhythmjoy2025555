-- Learning Gallery Tables
-- 유튜브 학습 갤러리를 위한 테이블 스키마 및 RLS 설정

-- 1. Learning Playlists (학습 재생목록/코스)
CREATE TABLE IF NOT EXISTS learning_playlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  category TEXT DEFAULT 'general', -- Lindy Hop, Solo Jazz, etc.
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Learning Videos (개별 영상)
CREATE TABLE IF NOT EXISTS learning_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID REFERENCES learning_playlists(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL, -- YouTube Video ID (e.g. dQw4w9WgXcQ)
  title TEXT NOT NULL,
  order_index INTEGER DEFAULT 0, -- 재생 순서
  memo TEXT, -- 관리자 코멘트/팁
  duration_seconds INTEGER, -- 영상 길이 (선택사항)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_learning_playlists_category ON learning_playlists(category);
CREATE INDEX IF NOT EXISTS idx_learning_playlists_is_public ON learning_playlists(is_public);
CREATE INDEX IF NOT EXISTS idx_learning_videos_playlist_id ON learning_videos(playlist_id);
CREATE INDEX IF NOT EXISTS idx_learning_videos_order ON learning_videos(order_index);

-- 4. Updated At Trigger
CREATE OR REPLACE FUNCTION update_learning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_playlists_updated_at
  BEFORE UPDATE ON learning_playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_updated_at();

CREATE TRIGGER learning_videos_updated_at
  BEFORE UPDATE ON learning_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_updated_at();

-- 5. RLS Policies
ALTER TABLE learning_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_videos ENABLE ROW LEVEL SECURITY;

-- Public Read Access (공개된 목록만)
CREATE POLICY "Public can view public playlists"
  ON learning_playlists FOR SELECT
  USING (is_public = true);

-- Public Read Access (공개된 목록의 비디오들)
CREATE POLICY "Public can view videos in public playlists"
  ON learning_videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM learning_playlists
      WHERE id = learning_videos.playlist_id
      AND is_public = true
    )
  );

-- Admin/Author Full Access
-- (간단하게 인증된 사용자는 생성 가능, 본인 것은 수정/삭제 가능으로 설정)
-- 실제 운영 시에는 admin role 체크를 더 강화할 수 있음

CREATE POLICY "Authenticated users can create playlists"
  ON learning_playlists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authors can update their playlists"
  ON learning_playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their playlists"
  ON learning_playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- Videos follow the playlist ownership roughly, or just authenticated creators
CREATE POLICY "Authenticated users can create videos"
  ON learning_videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update videos"
  ON learning_videos FOR UPDATE
  TO authenticated
  USING (true); -- 좀 더 정교한 권한 제어 필요시 playlist author 체크 추가 가능

CREATE POLICY "Authenticated users can delete videos"
  ON learning_videos FOR DELETE
  TO authenticated
  USING (true);
