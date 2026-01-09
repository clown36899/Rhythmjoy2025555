-- Add v2 integration columns to social_schedules
ALTER TABLE social_schedules ADD COLUMN IF NOT EXISTS v2_genre TEXT;
ALTER TABLE social_schedules ADD COLUMN IF NOT EXISTS v2_category TEXT;

-- Add comments for documentation
COMMENT ON COLUMN social_schedules.v2_genre IS 'v2 메인 페이지 노출을 위한 장르/분류명 (예: 동호회강습, 동호회정규강습)';
COMMENT ON COLUMN social_schedules.v2_category IS 'v2 필터링을 위한 카테고리 (예: club, class, event)';
