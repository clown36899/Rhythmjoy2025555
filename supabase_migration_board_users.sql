-- 게시판 회원 관리 시스템 마이그레이션
-- Supabase SQL Editor에서 실행하세요

-- 0. 설정 테이블 생성 (관리자 이메일 저장)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 관리자 이메일 설정 삽입 (VITE_ADMIN_EMAIL과 동일하게)
INSERT INTO system_settings (setting_key, setting_value)
VALUES ('admin_email', 'clown313@naver.com')
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value, updated_at = NOW();

-- 1. board_users 테이블 생성
CREATE TABLE IF NOT EXISTS board_users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE, -- Kakao user ID
  nickname VARCHAR(100) NOT NULL,
  real_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_board_users_user_id ON board_users(user_id);
CREATE INDEX IF NOT EXISTS idx_board_users_nickname ON board_users(nickname);

-- 3. board_posts 테이블에 author_nickname 컬럼 추가 (없으면)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'board_posts' AND column_name = 'author_nickname'
  ) THEN
    ALTER TABLE board_posts ADD COLUMN author_nickname VARCHAR(100);
  END IF;
END $$;

-- 4. Row Level Security (RLS) 설정
ALTER TABLE board_users ENABLE ROW LEVEL SECURITY;

-- SELECT는 차단 (RPC 함수를 통해서만 조회 가능)
-- INSERT는 모든 사용자 허용 (회원가입)
CREATE POLICY "Allow insert for all users"
  ON board_users FOR INSERT
  WITH CHECK (TRUE);

-- UPDATE, DELETE 차단 (필요시 관리자용 RPC 함수 추가)

-- 5. RPC 함수: 회원 가입
CREATE OR REPLACE FUNCTION register_board_user(
  p_user_id VARCHAR,
  p_nickname VARCHAR,
  p_real_name VARCHAR,
  p_phone VARCHAR,
  p_gender VARCHAR
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  -- 이미 등록된 사용자인지 확인
  IF EXISTS (SELECT 1 FROM board_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION '이미 가입된 사용자입니다.';
  END IF;

  -- 회원 등록
  INSERT INTO board_users (user_id, nickname, real_name, phone, gender)
  VALUES (p_user_id, p_nickname, p_real_name, p_phone, p_gender)
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'nickname', nickname,
    'real_name', real_name,
    'phone', phone,
    'gender', gender,
    'created_at', created_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC 함수: 본인 회원 정보 조회
CREATE OR REPLACE FUNCTION get_my_board_user(p_user_id VARCHAR)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'id', id,
    'user_id', user_id,
    'nickname', nickname,
    'real_name', real_name,
    'phone', phone,
    'gender', gender,
    'created_at', created_at
  ) INTO v_result
  FROM board_users
  WHERE user_id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC 함수: 관리자용 전체 회원 목록 조회
-- 서버 측에서 관리자 이메일 확인 (system_settings 테이블에서 조회)
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
  current_user_email TEXT;
  admin_email TEXT;
BEGIN
  -- 현재 로그인한 사용자의 이메일 가져오기
  current_user_email := auth.jwt() ->> 'email';
  
  -- system_settings에서 관리자 이메일 가져오기
  SELECT setting_value INTO admin_email
  FROM system_settings
  WHERE setting_key = 'admin_email';
  
  -- 관리자 이메일이 아니면 에러 발생
  IF current_user_email IS NULL OR current_user_email != admin_email THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다. (current: %, required: %)', current_user_email, admin_email;
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
