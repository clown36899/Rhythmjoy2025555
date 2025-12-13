-- 1. 현재 thumbnails 폴더 사용 중인 이벤트 확인
SELECT COUNT(*) as thumbnails_count
FROM events
WHERE image_thumbnail LIKE '%/thumbnails/%';

-- 2. thumbnails → thumbnail로 경로 변경
UPDATE events
SET image_thumbnail = REPLACE(image_thumbnail, '/thumbnails/', '/thumbnail/')
WHERE image_thumbnail LIKE '%/thumbnails/%';

-- 3. 결과 확인
SELECT COUNT(*) as thumbnail_count
FROM events
WHERE image_thumbnail LIKE '%/thumbnail/%';

-- 4. image_micro를 image_thumbnail과 동일하게 설정
UPDATE events 
SET image_micro = image_thumbnail 
WHERE image_thumbnail IS NOT NULL 
  AND image_micro IS NULL;
