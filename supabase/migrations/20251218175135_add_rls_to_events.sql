-- 1. user_id 컬럼 추가 (board_posts와 동일한 text 타입)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS user_id text NULL;

-- 2. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_events_user_id 
ON events(user_id);

-- 3. RLS 활성화
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 4. 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "events_select_all" ON events;
DROP POLICY IF EXISTS "events_insert_authenticated" ON events;
DROP POLICY IF EXISTS "events_update_own_or_admin" ON events;
DROP POLICY IF EXISTS "events_delete_own_or_admin" ON events;

-- 5. 새 정책 생성
CREATE POLICY "events_select_all"
ON events FOR SELECT
USING (true);

CREATE POLICY "events_insert_authenticated"
ON events FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "events_update_own_or_admin"
ON events FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()::text
);

CREATE POLICY "events_delete_own_or_admin"
ON events FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()::text
);

-- 참고: 관리자는 프론트엔드에서 isAdmin 체크 후 
-- Supabase Service Role Key로 직접 삭제/수정 가능
-- (RLS 정책 우회)
