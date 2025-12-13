-- DB에서 실제 이미지 경로 확인
SELECT 
  id,
  title,
  image_thumbnail,
  CASE 
    WHEN image_thumbnail LIKE '%/thumbnail/%' THEN 'thumbnail'
    WHEN image_thumbnail LIKE '%/thumbnails/%' THEN 'thumbnails'
    ELSE 'other'
  END as folder_type
FROM events
WHERE image_thumbnail IS NOT NULL
LIMIT 20;

-- 폴더별 개수 확인
SELECT 
  CASE 
    WHEN image_thumbnail LIKE '%/thumbnail/%' THEN 'thumbnail'
    WHEN image_thumbnail LIKE '%/thumbnails/%' THEN 'thumbnails'
    ELSE 'other'
  END as folder_type,
  COUNT(*) as count
FROM events
WHERE image_thumbnail IS NOT NULL
GROUP BY folder_type;
