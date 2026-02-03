-- ============================================================================
-- 20260203_session_logs_emergency_fix.sql
-- session_logs 401 에러 해결: 권한 재부여 및 UNIQUE 제약 조건 확보
-- ============================================================================

-- 1. session_id에 UNIQUE 제약 조건이 없다면 추가 (upsert 필수 조건)
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

-- 2. anon 역할에 권한 재부여
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, UPDATE ON public.session_logs TO anon;
GRANT INSERT, UPDATE ON public.session_logs TO authenticated;

-- 3. RLS 정책 재설정 (익명 접근 허용)
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_logs_insert_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_update_all" ON public.session_logs;

-- 모든 사용자(익명 포함) INSERT 허용
CREATE POLICY "session_logs_insert_all"
ON public.session_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자(익명 포함) UPDATE 허용
CREATE POLICY "session_logs_update_all"
ON public.session_logs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
