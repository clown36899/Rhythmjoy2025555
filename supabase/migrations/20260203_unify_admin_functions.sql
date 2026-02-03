-- ============================================================================
-- 20260203_unify_admin_functions.sql
-- 관리자 함수 통합: 최소 변경 전략
-- ============================================================================
-- 전략:
--   1. is_admin_user()를 메인 함수로 사용 (39개 RLS 정책에서 이미 사용 중)
--   2. is_admin_user() 로직을 board_admins 체크로 변경
--   3. get_user_admin_status()만 삭제 (의존성 적음)
--   4. is_admin()은 is_admin_user() alias로 유지
-- ============================================================================

-- 1. 먼저 의존하는 RLS 정책들을 is_admin()으로 변경

-- 1-1. pwa_installs 정책 업데이트
DROP POLICY IF EXISTS "Admins can read all PWA installs" ON pwa_installs;
CREATE POLICY "Admins can read all PWA installs"
ON pwa_installs
FOR SELECT
TO authenticated
USING (is_admin_user());

-- 1-2. session_logs 정책 업데이트
DROP POLICY IF EXISTS "Only main admins can view all sessions" ON session_logs;
CREATE POLICY "Only main admins can view all sessions"
ON session_logs
FOR SELECT
USING (is_admin_user());

-- 2. is_admin_user() 로직을 board_admins 체크로 변경
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = auth.uid()
  );
$$;

-- 3. is_admin()도 동일하게 변경 (또는 is_admin_user() 호출)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT is_admin_user();
$$;

-- 4. get_user_admin_status() 삭제 (의존성 해결됨)
DROP FUNCTION IF EXISTS get_user_admin_status();

-- 5. check_is_admin() 삭제 (의존성 없음)
DROP FUNCTION IF EXISTS check_is_admin(uuid);

-- 6. 권한 부여
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;
GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_user() TO anon;

-- 7. 설명 추가
COMMENT ON FUNCTION is_admin_user() IS '관리자 권한 체크 (board_admins 테이블 기반, UUID로 체크) - 메인 함수';
COMMENT ON FUNCTION is_admin() IS '관리자 권한 체크 (is_admin_user() alias)';
COMMENT ON TABLE board_admins IS '관리자 목록 (UUID 기반, Single Source of Truth)';

-- 8. 선택사항: 관리자 추가/제거 함수
CREATE OR REPLACE FUNCTION add_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can add new admins';
  END IF;
  
  INSERT INTO board_admins (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION remove_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can remove admins';
  END IF;
  
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself as admin';
  END IF;
  
  DELETE FROM board_admins WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_admin(uuid) TO authenticated;

COMMENT ON FUNCTION add_admin(uuid) IS '관리자 추가 (관리자만 가능)';
COMMENT ON FUNCTION remove_admin(uuid) IS '관리자 제거 (관리자만 가능, 자기 자신 제거 불가)';

