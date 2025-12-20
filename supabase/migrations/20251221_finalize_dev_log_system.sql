-- ==========================================
-- 1. App Versions Table Setup (Version Tracking)
-- ==========================================
CREATE TABLE IF NOT EXISTS app_versions (
    version TEXT PRIMARY KEY,
    released_at TIMESTAMPTZ DEFAULT NOW(),
    released_by UUID REFERENCES auth.users(id)
);

ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;

-- Reset Policies to avoid "already exists" errors
DROP POLICY IF EXISTS "Anyone can read versions" ON app_versions;
CREATE POLICY "Anyone can read versions" ON app_versions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert versions" ON app_versions;
CREATE POLICY "Admins can insert versions" ON app_versions 
    FOR INSERT WITH CHECK ( EXISTS (SELECT 1 FROM board_admins WHERE user_id = auth.uid()) );


-- ==========================================
-- 2. Dev Log Category Setup
-- ==========================================
-- Ensure 'dev-log' is a valid category in the check constraint
ALTER TABLE board_posts DROP CONSTRAINT IF EXISTS check_category;
ALTER TABLE board_posts ADD CONSTRAINT check_category 
  CHECK (category IN ('free', 'trade', 'notice', 'market', 'dev-log'));

-- Insert 'dev-log' category metadata
INSERT INTO board_categories (code, name, display_order, is_active)
VALUES ('dev-log', '개발일지', 100, true)
ON CONFLICT (code) DO UPDATE SET is_active = true, display_order = 100;


-- ==========================================
-- 3. Initial Data Seeding (Version 2.2.3)
-- ==========================================
-- 3-1. Record Version 2.2.3 in app_versions
INSERT INTO app_versions (version) VALUES ('2.2.3') ON CONFLICT DO NOTHING;

-- 3-2. Create the v2.2.3 Announcement Post (Idempotent check)
DO $$
DECLARE
  admin_id UUID;
  admin_name TEXT;
  post_title TEXT := 'Version 2.2.3 업데이트 안내';
BEGIN
  -- Find an admin to be the author
  SELECT id, email INTO admin_id, admin_name FROM auth.users ORDER BY created_at ASC LIMIT 1;
  
  -- Only proceed if admin exists AND post doesn't already exist
  IF admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM board_posts WHERE title = post_title AND category = 'dev-log') THEN
    INSERT INTO board_posts (
      title, 
      content, 
      category, 
      user_id, 
      author_name,
      is_notice
    ) VALUES (
      post_title, 
      '안녕하세요, 리듬앤조이 개발팀입니다.

금일 업데이트(v2.2.3)를 통해 다음과 같은 기능 개선이 이루어졌습니다.

1. **메뉴 순서 재배치**
   - 하단 메뉴바의 순서가 [이벤트 > 전체달력 > 자유게시판 > 연습실 > 쇼핑 > 안내] 순으로 변경되었습니다.
   
2. **게시판 댓글 수정 기능 복구**
   - 댓글 수정 시 입력창이 비어있던 문제와 권한 오류를 수정하여 정상적으로 동작합니다.

3. **모바일 레이아웃 최적화**
   - **탭바 고정:** 모바일 주소창 스크롤 시 탭바가 가려지는 현상을 수정하여 헤더 바로 아래에 고정되도록 개선했습니다. (Fixed Positioning)
   - **스크롤 여백 확보:** 게시글 목록 하단이 내용에 가려지지 않도록 충분한 여백을 확보했습니다.

시스템 구축이 완료되었습니다.
앞으로의 버전 업데이트는 관리자 페이지 접근 시 자동으로 이곳에 기록됩니다.', 
      'dev-log', 
      admin_id, 
      COALESCE(admin_name, 'Admin'), 
      true
    );
  END IF;
END $$;
