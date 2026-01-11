-- 🚑 [RECOVERY] Missing Table & Relationship Restoration
-- 누락된 `learning_categories` 테이블을 생성하고 연결 관계를 복구합니다.

-- 1. `learning_categories` 테이블 생성 (없을 경우)
CREATE TABLE IF NOT EXISTS public.learning_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES learning_categories(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- 최신 스키마 반영 (user_id 추가)
  metadata JSONB DEFAULT '{}'::jsonb, -- 최신 스키마 반영 (metadata 추가)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_learning_categories_parent ON public.learning_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_learning_categories_order ON public.learning_categories(order_index);
CREATE INDEX IF NOT EXISTS idx_learning_categories_user_id ON public.learning_categories(user_id);

-- RLS 활성화
ALTER TABLE public.learning_categories ENABLE ROW LEVEL SECURITY;

-- 정책: 누구나 조회 가능
DROP POLICY IF EXISTS "Public can view categories" ON public.learning_categories;
CREATE POLICY "Public can view categories" ON public.learning_categories FOR SELECT USING (true);

-- 정책: 로그인 유저는 관리 가능
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.learning_categories;
CREATE POLICY "Authenticated users can manage categories" ON public.learning_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2. `history_nodes` 연결 관계(Foreign Key) 복구
-- 기존 제약 조건 정리
ALTER TABLE public.history_nodes DROP CONSTRAINT IF EXISTS fk_history_nodes_linked_category;

-- 제약 조건 재생성
ALTER TABLE public.history_nodes
    ADD CONSTRAINT fk_history_nodes_linked_category
    FOREIGN KEY (linked_category_id)
    REFERENCES public.learning_categories(id)
    ON DELETE SET NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_history_nodes_linked_category_id ON public.history_nodes(linked_category_id);


-- 3. (옵션) 트리거 복구
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
