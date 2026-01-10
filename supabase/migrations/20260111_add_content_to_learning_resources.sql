-- 20260111_add_content_to_learning_resources.sql
-- 사용자 지정 추가 정보를 저장하기 위한 'content' 컬럼 추가

-- 1. learning_resources 테이블에 content 컬럼 추가
ALTER TABLE public.learning_resources 
ADD COLUMN IF NOT EXISTS content TEXT;

-- 2. history_nodes 테이블에도 일관성을 위해 content 컬럼 추가 (필요시 상세 정보 저장)
ALTER TABLE public.history_nodes 
ADD COLUMN IF NOT EXISTS content TEXT;

-- 3. 검색 성능 향상을 위한 인덱스 추가 (선택 사항)
CREATE INDEX IF NOT EXISTS idx_learning_resources_content 
ON public.learning_resources USING gin (to_tsvector('english', coalesce(content, '')));
