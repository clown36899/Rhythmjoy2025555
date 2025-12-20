-- 1. Update Board Posts Constraint to allow 'dev-log'
ALTER TABLE board_posts DROP CONSTRAINT IF EXISTS check_category;
ALTER TABLE board_posts ADD CONSTRAINT check_category 
  CHECK (category IN ('free', 'trade', 'notice', 'market', 'dev-log'));

-- 2. Insert 'Development Log' Category
INSERT INTO board_categories (code, name, display_order, is_active)
VALUES ('dev-log', '개발일지', -1, true)
ON CONFLICT (code) DO UPDATE SET is_active = true, display_order = -1;

-- 3. Insert Version 2.2.2 Release Note
-- Using the first user (likely admin) as the author
DO $$
DECLARE
  admin_id UUID;
  admin_name TEXT;
BEGIN
  -- Find an admin or first user
  SELECT id, email INTO admin_id, admin_name FROM auth.users ORDER BY created_at ASC LIMIT 1;
  
  -- If no user found, skip post creation (safety)
  IF admin_id IS NOT NULL THEN
    INSERT INTO board_posts (
      title, 
      content, 
      category, 
      user_id, 
      author_name
    ) VALUES (
      'Version 2.2.2 업데이트 안내', 
      '안녕하세요, 리듬앤조이 개발팀입니다.

금일 업데이트(v2.2.2)를 통해 다음과 같은 기능 개선이 이루어졌습니다.

1. **메뉴 순서 재배치**
   - 하단 메뉴바의 순서가 [이벤트 > 전체달력 > 자유게시판 > 연습실 > 쇼핑 > 안내] 순으로 변경되었습니다.
   
2. **게시판 댓글 수정 기능 복구**
   - 댓글 수정 시 입력창이 비어있던 문제와 권한 오류를 수정하여 정상적으로 동작합니다.

3. **모바일 레이아웃 최적화**
   - **탭바 고정:** 모바일 주소창 스크롤 시 탭바가 가려지는 현상을 수정하여 헤더 바로 아래에 고정되도록 개선했습니다. (Fixed Positioning)
   - **스크롤 여백 확보:** 게시글 목록 하단이 내용에 가려지지 않도록 충분한 여백을 확보했습니다.

앞으로도 더 나은 서비스를 위해 노력하겠습니다.
감사합니다.', 
      'dev-log', 
      admin_id, 
      COALESCE(admin_name, 'Admin')
    );
  END IF;
END $$;
