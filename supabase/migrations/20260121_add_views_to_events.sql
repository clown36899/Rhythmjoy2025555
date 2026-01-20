-- events 테이블에 views 컬럼 추가
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- 인덱스 추가 (선택사항, 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_events_views ON events(views DESC);

-- 기존 레코드의 views를 0으로 초기화 (이미 NULL이 아닌 경우 건너뜀)
UPDATE events 
SET views = 0 
WHERE views IS NULL;
