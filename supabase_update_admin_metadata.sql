-- 관리자 권한 설정 (app_metadata 방식으로 개선)
-- Supabase SQL Editor에서 실행하세요

-- 1. 기존 system_settings 테이블 삭제 (필요없음)
DROP TABLE IF EXISTS system_settings CASCADE;

-- 2. get_all_board_users 함수 업데이트 (app_metadata 방식)
CREATE OR REPLACE FUNCTION get_all_board_users()
RETURNS TABLE (
  id INTEGER,
  user_id VARCHAR,
  nickname VARCHAR,
  real_name VARCHAR,
  phone VARCHAR,
  gender VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  is_admin_flag TEXT;
BEGIN
  -- JWT의 app_metadata에서 is_admin 플래그 확인
  is_admin_flag := auth.jwt() -> 'app_metadata' ->> 'is_admin';
  
  -- 관리자가 아니면 에러 발생
  IF is_admin_flag IS NULL OR is_admin_flag != 'true' THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;
  
  -- 관리자 확인 완료 후 전체 회원 목록 반환
  RETURN QUERY
  SELECT 
    bu.id,
    bu.user_id,
    bu.nickname,
    bu.real_name,
    bu.phone,
    bu.gender,
    bu.created_at
  FROM board_users bu
  ORDER BY bu.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 관리자 사용자에게 is_admin 플래그 설정
-- 주의: 관리자 이메일을 실제 값으로 변경하세요 (예: clown313@naver.com)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE email = 'clown313@naver.com';

-- 4. 설정 확인 (선택사항)
-- SELECT email, raw_app_meta_data FROM auth.users WHERE email = 'clown313@naver.com';
