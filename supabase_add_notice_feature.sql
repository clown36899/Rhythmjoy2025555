-- 게시판 공지사항 기능 추가
-- Supabase SQL Editor에서 실행하세요

-- 1. board_posts 테이블에 is_notice 컬럼 추가
ALTER TABLE board_posts 
ADD COLUMN IF NOT EXISTS is_notice BOOLEAN DEFAULT FALSE;

-- 2. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_board_posts_is_notice ON board_posts(is_notice, created_at DESC);

-- 3. create_board_post RPC 함수 업데이트 (is_notice 파라미터 추가)
CREATE OR REPLACE FUNCTION create_board_post(
  p_user_id VARCHAR,
  p_title VARCHAR,
  p_content TEXT,
  p_author_name VARCHAR,
  p_author_nickname VARCHAR,
  p_is_notice BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  INSERT INTO board_posts (user_id, title, content, author_name, author_nickname, is_notice, views)
  VALUES (p_user_id, p_title, p_content, p_author_name, p_author_nickname, p_is_notice, 0)
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'author_name', author_name,
    'author_nickname', author_nickname,
    'is_notice', is_notice,
    'views', views,
    'created_at', created_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. update_board_post RPC 함수 업데이트 (is_notice 파라미터 추가)
CREATE OR REPLACE FUNCTION update_board_post(
  p_post_id INTEGER,
  p_user_id VARCHAR,
  p_title VARCHAR,
  p_content TEXT,
  p_is_notice BOOLEAN DEFAULT FALSE
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
    updated_at = NOW()
  WHERE id = p_post_id
  RETURNING json_build_object(
    'id', id,
    'title', title,
    'content', content,
    'is_notice', is_notice,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
