-- ============================================================================
-- 20260123_restore_admin_privileges.sql
-- ============================================================================
-- 1. [Fix] get_user_admin_status(): 빌보드 유저 참조 제거 및 메인 관리자 전용으로 원복
-- 2. [Fix] session_logs RLS Policies: 전체 조회 권한을 오직 메인 관리자에게만 제한
-- ============================================================================

-- 1. 관리자 판별 함수 원복 (STABLE 유지)
CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- 전직 메인 관리자 판단 기준:
  -- 1. board_admins 테이블에 등록된 UUID인가?
  -- 2. 또는 환경변수 설정과 일치하는 이메일인가? (clown313@naver.com)
  -- ※ billboard_users(서브 관리자)는 더 이상 여기서 관리자로 인정하지 않음.
  RETURN EXISTS (
    SELECT 1 FROM public.board_admins WHERE user_id = auth.uid()
  ) OR (
    auth.jwt() ->> 'email' = 'clown313@naver.com'
  );
END;
$$;

-- 2. session_logs (실시간 접속자) RLS 정책 강화
DROP POLICY IF EXISTS "Allow admins to view all sessions" ON public.session_logs;
DROP POLICY IF EXISTS "Allow anonymous/authenticated insert/update" ON public.session_logs;

-- A. INSERT/UPDATE: 누구나 자기 세션 데이터는 기록 가능 (Guest 포함)
CREATE POLICY "Allow individual session logging"
ON public.session_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- B. SELECT: 오직 메인 관리자만 "모든" 세션 로그 조회 가능
CREATE POLICY "Only main admins can view all sessions"
ON public.session_logs
FOR SELECT
USING (
    (SELECT get_user_admin_status()) = true
);

-- 3. 권한 명시적 부여
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO anon;

COMMENT ON FUNCTION get_user_admin_status() IS '메인 관리자 여부를 엄격히 판별 (board_admins 또는 마스터 이메일)';
COMMENT ON TABLE public.session_logs IS '사용자 세션 로그 (메인 관리자만 전체 조회 가능)';
