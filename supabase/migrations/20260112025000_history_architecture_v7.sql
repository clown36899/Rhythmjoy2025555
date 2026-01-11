-- 🏗️ 히스토리 아키텍처 V7: 독립형 및 확장형 구조 전환 마이그레이션

-- 1. 데이터 백업 (안전장치)
CREATE TABLE IF NOT EXISTS public.history_nodes_backup_v7 AS SELECT * FROM public.history_nodes;

-- 2. 노드 행위(Behavior) 타입 정의
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_behavior') THEN
        CREATE TYPE node_behavior AS ENUM ('LEAF', 'GROUP', 'PORTAL');
    END IF;
END $$;

-- 3. 히스토리 공간(Spaces) 테이블 생성
CREATE TABLE IF NOT EXISTS public.history_spaces (
    id BIGSERIAL PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '나의 타임라인',
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_history_spaces_owner_id ON public.history_spaces(owner_id);

-- RLS 설정
ALTER TABLE public.history_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can only see their own spaces" ON public.history_spaces;
CREATE POLICY "Users can only see their own spaces" ON public.history_spaces
    FOR ALL TO authenticated USING (auth.uid() = owner_id);

-- 4. history_nodes 테이블 컬럼 확장
ALTER TABLE public.history_nodes 
ADD COLUMN IF NOT EXISTS node_behavior node_behavior DEFAULT 'LEAF',
ADD COLUMN IF NOT EXISTS space_id BIGINT REFERENCES public.history_spaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS content_data JSONB DEFAULT '{}'::jsonb;

-- 5. 기존 데이터 마이그레이션 및 기본 공간 생성
DO $$
DECLARE
    user_record RECORD;
    new_space_id BIGINT;
BEGIN
    -- 각 유저마다 기본 공간(Root Space) 하나씩 생성
    FOR user_record IN SELECT DISTINCT created_by FROM public.history_nodes WHERE created_by IS NOT NULL LOOP
        INSERT INTO public.history_spaces (owner_id, title, is_default)
        VALUES (user_record.created_by, '기본 보관함', true)
        RETURNING id INTO new_space_id;

        -- 해당 유저의 모든 노드를 이 공간에 할당
        UPDATE public.history_nodes 
        SET space_id = new_space_id 
        WHERE created_by = user_record.created_by;
    END LOOP;

    -- 카테고리 기반 Behavior 자동 할당
    UPDATE public.history_nodes SET node_behavior = 'PORTAL' WHERE category = 'canvas';
    UPDATE public.history_nodes SET node_behavior = 'GROUP' WHERE category IN ('folder', 'playlist');
    UPDATE public.history_nodes SET node_behavior = 'LEAF' WHERE node_behavior = 'LEAF'; -- 나머지는 기본값 유지
END $$;

-- 6. 성능을 위한 인덱싱 고도화
CREATE INDEX IF NOT EXISTS idx_history_nodes_space_hierarchy 
ON public.history_nodes (space_id, parent_node_id);

CREATE INDEX IF NOT EXISTS idx_history_nodes_owner_id 
ON public.history_nodes (created_by);

-- 7. 코멘트 추가
COMMENT ON COLUMN public.history_nodes.node_behavior IS '노드의 동작 방식: LEAF(일반), GROUP(시각적 폴더), PORTAL(캔버스)';
COMMENT ON COLUMN public.history_nodes.space_id IS '노드가 속한 독립 작업 공간 ID';
COMMENT ON COLUMN public.history_nodes.content_data IS '외부 의존성 제거를 위한 노드 자체 데이터 백업 (JSON)';
