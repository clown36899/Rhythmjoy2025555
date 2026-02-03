-- 긴급: 관리자 권한 체크 RPC 수정
-- board_admins 체크 제거, 특정 이메일만 관리자로 인정

CREATE OR REPLACE FUNCTION get_user_admin_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- clown313@naver.com만 관리자로 인정
  RETURN auth.jwt() ->> 'email' = 'clown313@naver.com';
END;
$$;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN auth.jwt() ->> 'email' = 'clown313@naver.com';
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO anon;
GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_user() TO anon;
