-- 공지사항 기능 보안 강화 (관리자만 공지 설정 가능)

-- 1. create_board_post 함수 업데이트 (공지사항 권한 검증 추가)
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
  v_result JSONB;
  v_is_admin BOOLEAN;
  v_prefix_admin_only BOOLEAN;
BEGIN
  -- 관리자 여부 확인
  v_is_admin := COALESCE((auth.jwt()->>'app_metadata')::jsonb->>'is_admin' = 'true', FALSE);

  -- 공지사항은 관리자만 설정 가능
  IF p_is_notice = TRUE AND v_is_admin = FALSE THEN
    RAISE EXCEPTION '공지사항은 관리자만 작성할 수 있습니다.';
  END IF;

  -- prefix_id가 있으면 admin_only 여부 확인
  IF p_prefix_id IS NOT NULL THEN
    SELECT COALESCE(admin_only, FALSE) INTO v_prefix_admin_only
    FROM board_prefixes
    WHERE id = p_prefix_id;

    -- 관리자 전용 머릿말을 일반 사용자가 선택하려고 하면 에러
    IF COALESCE(v_prefix_admin_only, FALSE) = TRUE AND COALESCE(v_is_admin, FALSE) = FALSE THEN
      RAISE EXCEPTION '관리자 전용 머릿말입니다.';
    END IF;
  END IF;

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

  RETURN v_result::JSON;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. update_board_post 함수 업데이트 (공지사항 권한 검증 추가)
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
  v_result JSONB;
  v_is_admin BOOLEAN;
  v_prefix_admin_only BOOLEAN;
BEGIN
  -- 작성자 본인인지 확인
  IF NOT EXISTS (SELECT 1 FROM board_posts WHERE id = p_post_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  -- 관리자 여부 확인
  v_is_admin := COALESCE((auth.jwt()->>'app_metadata')::jsonb->>'is_admin' = 'true', FALSE);

  -- 공지사항은 관리자만 설정 가능
  IF p_is_notice = TRUE AND v_is_admin = FALSE THEN
    RAISE EXCEPTION '공지사항은 관리자만 설정할 수 있습니다.';
  END IF;

  -- prefix_id가 있으면 admin_only 여부 확인
  IF p_prefix_id IS NOT NULL THEN
    SELECT COALESCE(admin_only, FALSE) INTO v_prefix_admin_only
    FROM board_prefixes
    WHERE id = p_prefix_id;

    -- 관리자 전용 머릿말을 일반 사용자가 선택하려고 하면 에러
    IF COALESCE(v_prefix_admin_only, FALSE) = TRUE AND COALESCE(v_is_admin, FALSE) = FALSE THEN
      RAISE EXCEPTION '관리자 전용 머릿말입니다.';
    END IF;
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

  RETURN v_result::JSON;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
