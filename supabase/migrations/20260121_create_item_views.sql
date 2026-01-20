-- Phase 1: 범용 조회수 추적 테이블 생성 및 데이터 마이그레이션

-- 1. item_views 테이블 생성
CREATE TABLE IF NOT EXISTS item_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT,
  item_type TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- 복합 유니크 제약: 사용자/핑거프린트 + 아이템 타입 + 아이템 ID
  CONSTRAINT unique_user_item_view UNIQUE NULLS NOT DISTINCT (user_id, item_type, item_id),
  CONSTRAINT unique_fingerprint_item_view UNIQUE NULLS NOT DISTINCT (fingerprint, item_type, item_id),
  
  -- 사용자 ID 또는 핑거프린트 중 하나는 반드시 있어야 함
  CONSTRAINT check_user_or_fingerprint CHECK (
    (user_id IS NOT NULL AND fingerprint IS NULL) OR 
    (user_id IS NULL AND fingerprint IS NOT NULL)
  )
);

-- 2. 기존 board_post_views 데이터를 item_views로 복사
INSERT INTO item_views (user_id, fingerprint, item_type, item_id, created_at)
SELECT 
  user_id, 
  fingerprint, 
  'board_post' as item_type, 
  post_id as item_id, 
  created_at
FROM board_post_views
ON CONFLICT DO NOTHING;  -- 중복 방지

-- 3. 성능 최적화를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_item_views_user_id 
  ON item_views(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_views_fingerprint 
  ON item_views(fingerprint) 
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_views_item 
  ON item_views(item_type, item_id);

-- 4. RLS (Row Level Security) 정책 설정
ALTER TABLE item_views ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 조회 가능
CREATE POLICY "Views are viewable by everyone"
  ON item_views FOR SELECT
  USING (true);

-- 누구나 자신의 조회 기록 삽입 가능
CREATE POLICY "Anyone can insert views"
  ON item_views FOR INSERT
  WITH CHECK (true);

-- 5. 데이터 마이그레이션 검증 쿼리 (주석 처리)
-- SELECT 
--   'board_post_views' as source_table,
--   COUNT(*) as row_count
-- FROM board_post_views
-- UNION ALL
-- SELECT 
--   'item_views (board_post)' as source_table,
--   COUNT(*) as row_count
-- FROM item_views
-- WHERE item_type = 'board_post';

-- 참고: board_post_views 테이블은 검증 후 수동으로 삭제하세요
-- DROP TABLE board_post_views;
