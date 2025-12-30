-- events 테이블에 storage_path 컬럼 추가
-- 이 컬럼은 이미지들이 저장된 폴더 경로를 저장하는 용도입니다.

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN events.storage_path IS 'Supabase Storage에 저장된 이벤트 이미지 폴더 경로 (폴더 방식 삭제 지원용)';
