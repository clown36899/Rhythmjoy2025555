-- learning_categories 테이블에 Grid 레이아웃 지원을 위한 컬럼 추가
-- 이 쿼리를 Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.learning_categories
ADD COLUMN IF NOT EXISTS grid_row integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS grid_column integer DEFAULT 0;

-- 기존 데이터에 기본값 설정 (선택 사항)
UPDATE public.learning_categories
SET grid_row = 0, grid_column = 0
WHERE grid_row IS NULL;
