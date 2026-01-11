-- 🚑 [Simple Fix] Add Linked Category Foreign Key
-- 이미 제약조건이 있으면 삭제하고 다시 만듭니다.

-- 1. 기존 제약조건 삭제 (에러 무시)
ALTER TABLE public.history_nodes DROP CONSTRAINT IF EXISTS fk_history_nodes_linked_category;

-- 2. 제약조건 새로 추가
ALTER TABLE public.history_nodes
    ADD CONSTRAINT fk_history_nodes_linked_category
    FOREIGN KEY (linked_category_id)
    REFERENCES public.learning_categories(id)
    ON DELETE SET NULL;

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_history_nodes_linked_category_id ON public.history_nodes(linked_category_id);
