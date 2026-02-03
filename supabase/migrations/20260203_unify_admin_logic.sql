-- ============================================================================
-- 20260203_unify_admin_logic.sql
-- 관리자 함수 로직 통일 (함수 유지 + 로직만 변경)
-- ============================================================================
-- 전략:
--   - 모든 관리자 함수 유지 (삭제 안함)
--   - RLS 정책 변경 안함
--   - 모든 함수의 로직만 board_admins 체크로 통일
--   - Single Source of Truth: board_admins
-- ============================================================================

-- 1. is_admin_user() - 39개 RLS 정책에서 사용
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

-- 2. is_admin() - 독립적
CREATE OR REPLACE FUNCTION is_admin()
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

-- 3. get_user_admin_status() - Frontend에서 호출
CREATE OR REPLACE FUNCTION get_user_admin_status()
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

-- 4. check_is_admin(uuid) - 2개 events 정책에서 사용
CREATE OR REPLACE FUNCTION check_is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_admins
    WHERE user_id = p_user_id
  );
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_admin_status() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_is_admin(uuid) TO authenticated, anon;

-- 설명 업데이트
COMMENT ON FUNCTION is_admin_user() IS '관리자 체크 (board_admins UUID 기반)';
COMMENT ON FUNCTION is_admin() IS '관리자 체크 (board_admins UUID 기반)';
COMMENT ON FUNCTION get_user_admin_status() IS '관리자 체크 (board_admins UUID 기반)';
COMMENT ON FUNCTION check_is_admin(uuid) IS '특정 사용자 관리자 체크 (board_admins UUID 기반)';
COMMENT ON TABLE board_admins IS '관리자 목록 (Single Source of Truth)';

-- 선택사항: 관리자 추가/제거 함수
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
