-- ============================================================================
-- 20260203_fix_session_logs_rls_final.sql
-- session_logs 테이블 RLS 정책 수정: 익명 사용자 INSERT/UPDATE 허용
-- ============================================================================

-- 1. 기존 충돌하는 정책 모두 삭제
DROP POLICY IF EXISTS "Allow anonymous/authenticated insert/update" ON public.session_logs;
DROP POLICY IF EXISTS "Allow admins to view all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Admins can read all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Service role full access" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_insert_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_update_all" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_select_admin_only" ON public.session_logs;

-- 2. GRANT 권한 명시적 부여 (테이블 레벨)
GRANT INSERT, UPDATE ON public.session_logs TO anon;
GRANT INSERT, UPDATE ON public.session_logs TO authenticated;
GRANT SELECT ON public.session_logs TO authenticated;

-- 3. RLS 활성화 확인
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- 4. 새 RLS 정책 생성

-- A. INSERT: 모든 사용자(익명 포함) 허용
CREATE POLICY "session_logs_insert_all"
ON public.session_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- B. UPDATE: 모든 사용자(익명 포함) 허용
CREATE POLICY "session_logs_update_all"
ON public.session_logs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- C. SELECT: 관리자만 조회 가능
CREATE POLICY "session_logs_select_admin"
ON public.session_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.billboard_users 
        WHERE email = (auth.jwt() ->> 'email')
          AND is_active = true
    )
    OR
    (auth.jwt() ->> 'email') IN ('clown313@naver.com', 'clown313joy@gmail.com')
);

-- 5. 스키마 갱신 알림
NOTIFY pgrst, 'reload schema';

-- 6. 코멘트 업데이트
COMMENT ON TABLE public.session_logs IS '사용자 세션 로그 (익명 포함 모든 사용자 쓰기 가능, 관리자만 조회)';

