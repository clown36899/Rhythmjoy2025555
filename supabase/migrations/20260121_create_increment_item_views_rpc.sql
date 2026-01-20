-- Phase 2: 범용 조회수 증가 RPC 함수

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS increment_board_post_views(bigint);
DROP FUNCTION IF EXISTS increment_board_post_views(bigint, uuid, text, text);
DROP FUNCTION IF EXISTS increment_board_post_views(bigint, uuid, text);

-- 범용 increment_item_views 함수 생성
CREATE OR REPLACE FUNCTION increment_item_views(
  p_item_id BIGINT,
  p_item_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  -- 조회 기록 삽입 시도
  BEGIN
    INSERT INTO item_views (item_id, item_type, user_id, fingerprint)
    VALUES (p_item_id, p_item_type, p_user_id, p_fingerprint);
    
    v_inserted := TRUE;
  EXCEPTION
    WHEN unique_violation THEN
      -- 이미 조회한 기록이 있음
      v_inserted := FALSE;
  END;

  -- 신규 조회인 경우에만 해당 테이블의 views 컬럼 증가
  IF v_inserted THEN
    -- item_type에 따라 적절한 테이블 업데이트
    CASE p_item_type
      WHEN 'board_post' THEN
        UPDATE board_posts 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'event' THEN
        UPDATE events 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      WHEN 'schedule' THEN
        UPDATE social_schedules 
        SET views = COALESCE(views, 0) + 1 
        WHERE id = p_item_id;
        
      -- 새로운 타입 추가 시 여기에 WHEN 절 추가
      -- WHEN 'new_type' THEN
      --   UPDATE new_table SET views = COALESCE(views, 0) + 1 WHERE id = p_item_id;
      
      ELSE
        -- 지원하지 않는 타입인 경우 경고 (하지만 item_views에는 기록됨)
        RAISE WARNING 'Unsupported item_type: %. View recorded but counter not updated.', p_item_type;
    END CASE;
  END IF;

  RETURN v_inserted;
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION increment_item_views(BIGINT, TEXT, UUID, TEXT) TO public;
GRANT EXECUTE ON FUNCTION increment_item_views(BIGINT, TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_item_views(BIGINT, TEXT, UUID, TEXT) TO authenticated;

-- 사용 예시 (주석)
-- SELECT increment_item_views(76, 'board_post', 'user-uuid', NULL);  -- 로그인 사용자
-- SELECT increment_item_views(123, 'event', NULL, 'fp_xxxxx');       -- 비로그인 사용자
