-- 🚑 [RECOVERY] Orphaned Data Cleanup & Constraint Application
-- 존재하지 않는 카테고리를 참조하는 '고아 노드'들의 연결을 해제하여 에러를 해결합니다.

DO $$ 
BEGIN
    -- 1. 고아 참조 정리 (Clean up invalid references)
    -- learning_categories 테이블에 없는 ID를 가리키는 history_nodes의 연결 정보를 NULL로 초기화합니다.
    -- 데이터 자체는 삭제되지 않으며, 단지 '연결'만 해제됩니다.
    UPDATE public.history_nodes
    SET linked_category_id = NULL
    WHERE linked_category_id IS NOT NULL
    AND linked_category_id NOT IN (SELECT id FROM public.learning_categories);

    -- 2. 제약 조건 안전하게 적용
    -- 데이터가 정리되었으므로 이제 제약 조건을 걸어도 에러가 나지 않습니다.
    ALTER TABLE public.history_nodes 
    DROP CONSTRAINT IF EXISTS fk_history_nodes_linked_category;

    ALTER TABLE public.history_nodes
    ADD CONSTRAINT fk_history_nodes_linked_category
    FOREIGN KEY (linked_category_id)
    REFERENCES public.learning_categories(id)
    ON DELETE SET NULL;

    -- 3. 확인용 로그 출력 (옵션)
    RAISE NOTICE 'Orphaned references cleaned and foreign key constraint applied successfully.';
END $$;
