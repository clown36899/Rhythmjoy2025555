-- 이미지 최적화를 위한 3가지 크기 컬럼 추가
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS image_thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS image_medium TEXT,
  ADD COLUMN IF NOT EXISTS image_full TEXT;

-- 기존 image 데이터를 image_full로 복사 (백워드 호환성)
UPDATE events 
SET 
  image_full = image,
  image_medium = image,
  image_thumbnail = image
WHERE image IS NOT NULL 
  AND (image_full IS NULL OR image_medium IS NULL OR image_thumbnail IS NULL);

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_events_image_thumbnail ON events(image_thumbnail);
CREATE INDEX IF NOT EXISTS idx_events_image_medium ON events(image_medium);
CREATE INDEX IF NOT EXISTS idx_events_image_full ON events(image_full);
