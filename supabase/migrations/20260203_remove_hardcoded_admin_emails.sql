-- ============================================================================
-- 20260203_remove_hardcoded_admin_emails.sql
-- 관리자 이메일 하드코딩 제거 및 billboard_users 기반 체크로 통일
-- ============================================================================

-- 1. get_user_admin_status() RPC 함수 업데이트
-- billboard_users.is_active 기반으로 통일
CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- billboard_users 테이블의 is_active 확인
  RETURN EXISTS (
    SELECT 1
    FROM public.billboard_users
    WHERE email = auth.email()
      AND is_active = true
  );
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO anon;

-- 2. is_admin_user() alias 함수도 동일하게 업데이트
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- get_user_admin_status()와 동일한 로직
  RETURN EXISTS (
    SELECT 1
    FROM public.billboard_users
    WHERE email = auth.email()
      AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_user() TO anon;

-- 3. session_logs RLS 정책 업데이트 (하드코딩 제거)
DROP POLICY IF EXISTS "session_logs_select_admin" ON public.session_logs;

CREATE POLICY "session_logs_select_admin"
ON public.session_logs
FOR SELECT
TO authenticated
USING (public.is_admin_user());

-- 4. 기타 테이블 RLS 정책 확인 및 업데이트
-- (필요시 추가 정책 업데이트)

-- 5. 코멘트 업데이트
COMMENT ON FUNCTION get_user_admin_status() IS '관리자 권한 체크 (billboard_users.is_active 기반)';
COMMENT ON FUNCTION is_admin_user() IS '관리자 권한 체크 (billboard_users.is_active 기반, get_user_admin_status() alias)';
