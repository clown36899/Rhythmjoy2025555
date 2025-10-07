-- Production DB에 색상 설정 테이블 생성하기
-- Supabase 대시보드의 SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS theme_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  background_color VARCHAR(7) DEFAULT '#000000',
  header_bg_color VARCHAR(7) DEFAULT '#1f2937',
  calendar_bg_color VARCHAR(7) DEFAULT '#111827',
  event_list_bg_color VARCHAR(7) DEFAULT '#1f2937',
  event_list_outer_bg_color VARCHAR(7) DEFAULT '#111827',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 기본 설정 삽입
INSERT INTO theme_settings (id, background_color, header_bg_color, calendar_bg_color, event_list_bg_color, event_list_outer_bg_color)
VALUES (1, '#000000', '#1f2937', '#111827', '#1f2937', '#111827')
ON CONFLICT (id) DO NOTHING;
