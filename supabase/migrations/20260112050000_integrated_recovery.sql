-- 🚑 [MASTER RECOVERY] Integrated Fix Script
-- 테이블 생성부터 데이터 정리, 제약 조건 연결까지 한 번에 수행합니다.
-- 이 스크립트는 이전에 실패했던 모든 단계를 포함하므로, 이것 하나만 실행하면 됩니다.

BEGIN; -- 트랜잭션 시작 (전체 성공 아니면 전체 취소)

    -- 1. `learning_categories` 테이블 복원
    CREATE TABLE IF NOT EXISTS public.learning_categories (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id UUID REFERENCES learning_categories(id) ON DELETE CASCADE,
      order_index INTEGER DEFAULT 0,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 인덱스 및 정책 복구
    CREATE INDEX IF NOT EXISTS idx_learning_categories_parent ON public.learning_categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_learning_categories_order ON public.learning_categories(order_index);
    CREATE INDEX IF NOT EXISTS idx_learning_categories_user_id ON public.learning_categories(user_id);

    ALTER TABLE public.learning_categories ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public can view categories" ON public.learning_categories;
    CREATE POLICY "Public can view categories" ON public.learning_categories FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.learning_categories;
    CREATE POLICY "Authenticated users can manage categories" ON public.learning_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);


    -- 2. 고아 데이터 정리 (Data Cleanup)
    -- 테이블이 방금 생성되었으므로 비어있습니다. 
    -- 기존 history_nodes가 가리키던 category_id는 모두 유효하지 않으므로 NULL로 초기화합니다.
    UPDATE public.history_nodes
    SET linked_category_id = NULL
    WHERE linked_category_id IS NOT NULL;


    -- 3. 연결 관계(Foreign Key) 설정
    -- 이제 데이터가 깨끗하므로 제약 조건을 안전하게 걸 수 있습니다.
    ALTER TABLE public.history_nodes 
    DROP CONSTRAINT IF EXISTS fk_history_nodes_linked_category;

    ALTER TABLE public.history_nodes
    ADD CONSTRAINT fk_history_nodes_linked_category
    FOREIGN KEY (linked_category_id)
    REFERENCES public.learning_categories(id)
    ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_history_nodes_linked_category_id ON public.history_nodes(linked_category_id);


    -- 4. 트리거 설정
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tr_learning_categories_update ON public.learning_categories;
    CREATE TRIGGER tr_learning_categories_update
      BEFORE UPDATE ON public.learning_categories
      FOR EACH ROW
      EXECUTE FUNCTION update_timestamp();

COMMIT; -- 트랜잭션 확정
