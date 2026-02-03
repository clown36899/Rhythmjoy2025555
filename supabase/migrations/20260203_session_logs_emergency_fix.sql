-- ============================================================================
-- 20260203_session_logs_emergency_fix_v2.sql
-- session_logs 401 및 RLS 에러 해결: SELECT 권한 포함 및 정책 정합성 확보
-- ============================================================================

-- 1. session_id에 UNIQUE 제약 조건 확보 (upsert 필수 조건)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.session_logs'::regclass 
        AND conname = 'session_logs_session_id_key'
    ) THEN
        ALTER TABLE public.session_logs ADD CONSTRAINT session_logs_session_id_key UNIQUE (session_id);
    END IF;
END $$;

-- 2. 권한 재부여 (SELECT 권한 필수: upsert는 내부적으로 select를 수행함)
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, UPDATE, SELECT ON public.session_logs TO anon;
GRANT INSERT, UPDATE, SELECT ON public.session_logs TO authenticated;

-- 3. RLS 정책 재설정
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_logs_insert_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_update_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_select_all" ON public.session_logs;

-- INSERT: 누구나 허용
CREATE POLICY "session_logs_insert_all"
ON public.session_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- UPDATE: 누구나 허용
CREATE POLICY "session_logs_update_all"
ON public.session_logs FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

-- SELECT: 누구나 허용 (접속자 통계 및 upsert 작동용)
CREATE POLICY "session_logs_select_all"
ON public.session_logs FOR SELECT TO anon, authenticated
USING (true);

-- 4. 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
