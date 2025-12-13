-- 1. micro 컬럼 추가
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS micro TEXT;

-- 2. 기존 이벤트의 micro를 thumbnail과 동일하게 설정
UPDATE events 
SET micro = thumbnail 
WHERE thumbnail IS NOT NULL 
  AND micro IS NULL;

-- 3. 결과 확인
SELECT 
  COUNT(*) as total_events,
  COUNT(thumbnail) as has_thumbnail,
  COUNT(micro) as has_micro
FROM events;
