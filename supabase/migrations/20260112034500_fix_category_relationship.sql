-- 🚑 [Fix] Foreign Key Relationship Repair
-- history_nodes 테이블의 linked_category_id 컬럼에 대한 외래 키 제약 조건을 명시적으로 추가합니다.

DO $$ 
BEGIN
    -- 1. learning_categories 테이블 존재 여부 확인 (안전장치)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'learning_categories') THEN
        
        -- 2. 기존 제약 조건이 있다면 삭제 (중복 방지 및 재생성)
        ALTER TABLE public.history_nodes 
        DROP CONSTRAINT IF EXISTS fk_history_nodes_linked_category;

        -- 3. 외래 키 제약 조건 추가
        ALTER TABLE public.history_nodes
        ADD CONSTRAINT fk_history_nodes_linked_category
        FOREIGN KEY (linked_category_id)
        REFERENCES public.learning_categories(id)
        ON DELETE SET NULL;

        -- 4. 인덱스 생성 (성능 최적화)
        CREATE INDEX IF NOT EXISTS idx_history_nodes_linked_category_id 
        ON public.history_nodes(linked_category_id);

    END IF;
END $$;

COMMENT ON CONSTRAINT fk_history_nodes_linked_category ON public.history_nodes IS 'Category linkage for timeline nodes';
