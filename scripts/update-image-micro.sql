-- 1. 먼저 현재 상태 확인
SELECT 
  COUNT(*) as total_events,
  COUNT(image_thumbnail) as has_thumbnail,
  COUNT(image_micro) as has_micro
FROM events;

-- 2. thumbnails 폴더 참조 확인
SELECT id, title, image_thumbnail
FROM events
WHERE image_thumbnail LIKE '%/thumbnails/%'
LIMIT 10;

-- 3. thumbnail 폴더 참조 확인
SELECT id, title, image_thumbnail
FROM events
WHERE image_thumbnail LIKE '%/thumbnail/%'
LIMIT 10;

-- 4. image_micro를 image_thumbnail과 동일하게 설정 (임시)
UPDATE events 
SET image_micro = image_thumbnail 
WHERE image_thumbnail IS NOT NULL 
  AND image_micro IS NULL;

-- 5. 결과 확인
SELECT 
  COUNT(*) as total_events,
  COUNT(image_thumbnail) as has_thumbnail,
  COUNT(image_micro) as has_micro
FROM events;
