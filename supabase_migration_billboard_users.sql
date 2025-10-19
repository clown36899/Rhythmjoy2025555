-- 빌보드 사용자 관리 시스템 마이그레이션
-- Supabase SQL Editor에서 실행하세요

-- UUID 확장 활성화 (이미 있다면 에러 무시)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. billboard_users 테이블 생성
CREATE TABLE IF NOT EXISTS billboard_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 2. billboard_user_settings 테이블 생성
CREATE TABLE IF NOT EXISTS billboard_user_settings (
  id SERIAL PRIMARY KEY,
  billboard_user_id UUID NOT NULL REFERENCES billboard_users(id) ON DELETE CASCADE,
  excluded_weekdays INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  excluded_event_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  auto_slide_interval INTEGER DEFAULT 5000,
  transition_duration INTEGER DEFAULT 500,
  play_order VARCHAR(20) DEFAULT 'sequential' CHECK (play_order IN ('sequential', 'random')),
  date_filter_start DATE,
  date_filter_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(billboard_user_id)
);

-- 3. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_billboard_users_is_active ON billboard_users(is_active);
CREATE INDEX IF NOT EXISTS idx_billboard_user_settings_user_id ON billboard_user_settings(billboard_user_id);

-- 4. 자동 업데이트 트리거 (updated_at 필드)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_billboard_user_settings_updated_at
  BEFORE UPDATE ON billboard_user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Row Level Security (RLS) 설정
ALTER TABLE billboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE billboard_user_settings ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (공개 빌보드 표시용)
CREATE POLICY "Public billboard users are viewable by everyone"
  ON billboard_users FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Public billboard settings are viewable by everyone"
  ON billboard_user_settings FOR SELECT
  USING (TRUE);

-- 삽입/업데이트/삭제는 모든 사용자 허용 (프론트엔드에서 관리자 비밀번호로 보호)
-- 주의: 실제 운영 환경에서는 Supabase Auth를 사용하여 보안 강화 권장
CREATE POLICY "Allow insert billboard users"
  ON billboard_users FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Allow update billboard users"
  ON billboard_users FOR UPDATE
  USING (TRUE);

CREATE POLICY "Allow delete billboard users"
  ON billboard_users FOR DELETE
  USING (TRUE);

CREATE POLICY "Allow insert billboard settings"
  ON billboard_user_settings FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Allow update billboard settings"
  ON billboard_user_settings FOR UPDATE
  USING (TRUE);

CREATE POLICY "Allow delete billboard settings"
  ON billboard_user_settings FOR DELETE
  USING (TRUE);

-- 6. 샘플 데이터 (선택사항 - 테스트용)
-- INSERT INTO billboard_users (id, name, password_hash, is_active) 
-- VALUES ('123e4567-e89b-12d3-a456-426614174000', '강남점 빌보드', 'hashed_password_here', TRUE);

-- INSERT INTO billboard_user_settings (billboard_user_id, excluded_weekdays, auto_slide_interval, play_order)
-- VALUES ('123e4567-e89b-12d3-a456-426614174000', ARRAY[0, 6], 5000, 'random');
