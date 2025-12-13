-- 1. image_micro 컬럼 추가
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS image_micro TEXT;

-- 2. 기존 이벤트의 image_micro를 image_thumbnail과 동일하게 설정
UPDATE events 
SET image_micro = image_thumbnail 
WHERE image_thumbnail IS NOT NULL 
  AND image_micro IS NULL;

-- 3. 결과 확인
SELECT 
  COUNT(*) as total_events,
  COUNT(image_thumbnail) as has_thumbnail,
  COUNT(image_micro) as has_micro
FROM events;
