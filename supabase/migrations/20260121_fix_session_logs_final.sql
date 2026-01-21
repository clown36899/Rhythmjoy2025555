-- ========================================
-- [최종 보정] session_logs 테이블 스키마 및 RLS 정책 수정
-- ========================================

-- 1. 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Service role full access to sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Admins can read all sessions" ON public.session_logs;

-- 2. 컬럼 타입 수정 (is_admin: Integer -> Boolean)
DO $$ 
BEGIN 
    IF exists (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_logs' AND column_name = 'is_admin' AND data_type = 'integer') THEN
        -- 기본값 제거
        ALTER TABLE public.session_logs ALTER COLUMN is_admin DROP DEFAULT;
        -- 타입 변경
        ALTER TABLE public.session_logs ALTER COLUMN is_admin TYPE BOOLEAN USING (is_admin <> 0);
        -- 새로운 기본값 설정
        ALTER TABLE public.session_logs ALTER COLUMN is_admin SET DEFAULT FALSE;
    END IF;
END $$;

-- 3. 부족한 컬럼 추가
ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS is_pwa BOOLEAN DEFAULT FALSE;
ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS pwa_display_mode TEXT;
ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0;
ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS page_views INTEGER DEFAULT 0;

-- 4. RLS 정책 재설정
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- A. 누구나 자신의 세션을 기록/수정할 수 있음
CREATE POLICY "Allow all users to insert/update sessions"
ON public.session_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- B. 관리자만 모든 세션을 볼 수 있음 (billboard_users 테이블의 활성 이메일 대조)
CREATE POLICY "Allow admins to view all sessions"
ON public.session_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.billboard_users 
        WHERE email = (auth.jwt() ->> 'email')
          AND is_active = true
    )
    OR
    (auth.jwt() ->> 'email') = 'clown313@naver.com' -- 환경변수 기반 백업
);

-- C. Service Role 권한
CREATE POLICY "Service role full access"
ON public.session_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. 인덱스 최적화
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id_v2 ON public.session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_created_at_v2 ON public.session_logs(created_at);
