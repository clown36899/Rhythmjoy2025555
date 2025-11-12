-- 게시판 머릿말 기능 추가
-- Supabase SQL Editor에서 실행하세요

-- 1. board_prefixes 테이블 생성
CREATE TABLE IF NOT EXISTS board_prefixes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  admin_only BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 기본 머릿말 데이터 삽입
INSERT INTO board_prefixes (name, color, admin_only, display_order) VALUES
  ('공지', '#EF4444', TRUE, 0),
  ('건의사항', '#3B82F6', FALSE, 1),
  ('잡담', '#10B981', FALSE, 2),
  ('행사', '#F59E0B', FALSE, 3),
  ('후기', '#8B5CF6', FALSE, 4),
  ('강습', '#EC4899', FALSE, 5)
ON CONFLICT DO NOTHING;

-- 3. board_posts 테이블에 prefix_id 컬럼 추가
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS prefix_id INTEGER REFERENCES board_prefixes(id) ON DELETE SET NULL;

-- 4. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_board_posts_prefix_id ON board_posts(prefix_id);

-- 5. RLS 정책: 모든 사용자가 머릿말 읽기 가능
ALTER TABLE board_prefixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read prefixes"
  ON board_prefixes FOR SELECT
  USING (true);

-- 6. RLS 정책: 관리자만 머릿말 추가/수정/삭제
CREATE POLICY "Admin can insert prefixes"
  ON board_prefixes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'is_admin')::boolean = true
    )
  );

CREATE POLICY "Admin can update prefixes"
  ON board_prefixes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'is_admin')::boolean = true
    )
  );

CREATE POLICY "Admin can delete prefixes"
  ON board_prefixes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_app_meta_data->>'is_admin')::boolean = true
    )
  );

-- 7. create_board_post RPC 함수 업데이트 (prefix_id 파라미터 추가)
CREATE OR REPLACE FUNCTION create_board_post(
  p_user_id VARCHAR,
  p_title VARCHAR,
  p_content TEXT,
  p_author_name VARCHAR,
  p_author_nickname VARCHAR,
  p_is_notice BOOLEAN DEFAULT FALSE,
  p_prefix_id INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  INSERT INTO board_posts (user_id, title, content, author_name, author_nickname, is_notice, prefix_id, views)
  VALUES (p_user_id, p_title, p_content, p_author_name, p_author_nickname, p_is_notice, p_prefix_id, 0)
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'author_name', author_name,
    'author_nickname', author_nickname,
    'is_notice', is_notice,
    'prefix_id', prefix_id,
    'views', views,
    'created_at', created_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. update_board_post RPC 함수 업데이트 (prefix_id 파라미터 추가)
CREATE OR REPLACE FUNCTION update_board_post(
  p_post_id INTEGER,
  p_user_id VARCHAR,
  p_title VARCHAR,
  p_content TEXT,
  p_is_notice BOOLEAN DEFAULT FALSE,
  p_prefix_id INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  -- 작성자 본인인지 확인
  IF NOT EXISTS (SELECT 1 FROM board_posts WHERE id = p_post_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  UPDATE board_posts
  SET 
    title = p_title,
    content = p_content,
    is_notice = p_is_notice,
    prefix_id = p_prefix_id,
    updated_at = NOW()
  WHERE id = p_post_id
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'is_notice', is_notice,
    'prefix_id', prefix_id,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
