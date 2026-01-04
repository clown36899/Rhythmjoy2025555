-- 개별 동영상(Standalone Video)에 대한 조회 권한 정책 추가

-- 1. 공개된 개별 동영상은 누구나 조회 가능
CREATE POLICY "Public standalone videos are viewable by everyone"
ON learning_videos FOR SELECT
USING (
  playlist_id IS NULL AND is_public = true
);

-- 2. 자신이 작성한 개별 동영상은 조회 가능 (비공개 포함)
CREATE POLICY "Users can view their own standalone videos"
ON learning_videos FOR SELECT
USING (
  playlist_id IS NULL AND author_id = auth.uid()
);
