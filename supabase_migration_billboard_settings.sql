-- 메인 광고판 설정 테이블 (기존 광고판 기능용)
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS billboard_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT TRUE,
  auto_slide_interval INTEGER DEFAULT 5000,
  inactivity_timeout INTEGER DEFAULT 30000,
  auto_open_on_load BOOLEAN DEFAULT FALSE,
  transition_duration INTEGER DEFAULT 500,
  date_range_start DATE,
  date_range_end DATE,
  show_date_range BOOLEAN DEFAULT FALSE,
  play_order VARCHAR(20) DEFAULT 'sequential' CHECK (play_order IN ('sequential', 'random')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 초기 데이터 삽입 (이미 있다면 에러 무시)
INSERT INTO billboard_settings (id, enabled, auto_slide_interval, inactivity_timeout, auto_open_on_load, transition_duration, play_order)
VALUES (1, TRUE, 5000, 30000, FALSE, 500, 'sequential')
ON CONFLICT (id) DO NOTHING;

-- 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_billboard_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_billboard_settings_updated_at
  BEFORE UPDATE ON billboard_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_billboard_settings_updated_at();

-- RLS 설정
ALTER TABLE billboard_settings ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Public billboard settings are viewable by everyone"
  ON billboard_settings FOR SELECT
  USING (TRUE);

-- 모든 사용자가 수정 가능 (프론트엔드에서 관리자 비밀번호로 보호)
CREATE POLICY "Allow update billboard settings"
  ON billboard_settings FOR UPDATE
  USING (TRUE);
